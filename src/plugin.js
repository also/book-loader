const Module = require('module');
const cheerio = require('cheerio');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

const PageUrlDependency = require('./PageUrlDependency');

const BOOK_ASSETS = Symbol('BOOK_ASSETS');
const TOC = Symbol('TOC');

module.exports = class BookPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    const {options} = this;
    options.entry.forEach((entry) => {
      compiler.apply(new SingleEntryPlugin(compiler.options.context, entry, `book-loader-${entry}`));
    });

    compiler.plugin('compilation', (compilation, {normalModuleFactory}) => {
      compilation.plugin('normal-module-loader', (context) => {
        context.bookLoaderOptions = options;
      });

      compilation.dependencyFactories.set(PageUrlDependency, normalModuleFactory);
      compilation.dependencyTemplates.set(PageUrlDependency, new PageUrlDependency.Template());
    });

    compiler.plugin('compilation', (compilation, {normalModuleFactory}) => {
      compilation.plugin('build-module', (mod) => {
        // remove cached assets when a module is rebuilt
        delete mod[BOOK_ASSETS];
        delete mod[TOC];
      });

      normalModuleFactory.plugin('parser', (parser) => {
        parser.plugin('call book.pageUrl', function (expr) {
          var param = this.evaluateExpression(expr.arguments[0]);
          if (param.isString()) {
            var dep = new PageUrlDependency(param.string, expr.range);
            dep.loc = expr.loc;
            this.state.current.addDependency(dep);
            return true;
          }
        });
      });
    });

    compiler.plugin('emit', (compilation, callback) => {
      compilation.chunks = compilation.chunks.filter((chunk) => {
        // skip chunks without a book entry point
        if (!(chunk.entryModule.loaders || []).find((s) => s.loader.indexOf('book-loader/index.js') >= 0)) {
          return true;
        }

        const {files} = chunk;
        if (files.length !== 1) {
          return true;
        }

        const modulesById = new Map(chunk.modules.map((mod) => ['' + mod.id, mod]));

        function getWebpackModule(id) {
          return modulesById.get('' + id);
        }

        const tocs = new Map();

        const getToc = (tocModuleId) => {
          tocModuleId = '' + tocModuleId;
          const webpackModule = getWebpackModule(tocModuleId);
          let toc = tocs.get(tocModuleId) || webpackModule[TOC];
          if (!toc) {
            const page = bookRequire(tocModuleId);
            const html = page.html();
            const $ = cheerio.load(html);
            const pages = $('a').toArray().map((a) => {
              a = $(a);
              return {url: a.attr('href'), title: a.text()};
            });

            toc = {
              html,
              $,
              pages,
              page,
              webpackModule
            };
            tocs.set(tocModuleId, toc);

            if (this.options.cachePages) {
              webpackModule[TOC] = toc;
            }
          }

          return toc;
        };

        let bookRequire;

        const createAsset = (moduleId, page, webpackModule) => {
          const fileDependencies = new Set(webpackModule.fileDependencies);
          let {html, attributes={}, template: templateModuleId, toc: tocModuleId} = page;
          const publicUrl = page.toString();

          // the page with some extra attributes for the template
          const renderingPage = Object.assign({}, page);

          if (tocModuleId != null) {
            const toc = getToc(tocModuleId);
            renderingPage.toc = toc.page;
            fileDependencies.add(toc.webpackModule.resource);

            const pageIndex = toc.pages.findIndex(({url: tocUrl}) => publicUrl === tocUrl);

            if (pageIndex !== -1) {
              renderingPage.previous = toc.pages[pageIndex - 1];
              renderingPage.next = toc.pages[pageIndex + 1];
            }
          }

          const basename = webpackModule.resource.split('/').pop();
          const dateMatch = basename.match(/(^\d{4}-\d{2}-\d{2})-/);

          if (dateMatch) {
            attributes = Object.assign({date: dateMatch[1]}, attributes);
          }

          Object.assign(renderingPage, {attributes, options});

          try {
            html = html(renderingPage);
          } catch (e) {
            e.module = getWebpackModule(moduleId);
            e.details = e.stack;
            compilation.errors.push(e);
            html = `build error`;
          }

          const $ = cheerio.load(html);

          let {title} = attributes;
          if (!title) {
            if (tocs.has(moduleId)) {
              title = 'Table of Contents';
            } else {
              const titleElt = $('h1, h2');
              if (titleElt.length === 0) {
                const e = new Error(`No h1 or h2 or title attribute`);
                e.module = getWebpackModule(moduleId);
                compilation.warnings.push(e);
              } else {
                title = titleElt.first().text();
              }
            }
          }

          renderingPage.title = title;

          let completeHtml;
          if (templateModuleId) {
            const templatePage = bookRequire(templateModuleId);
            completeHtml = templatePage.html(Object.assign({}, renderingPage, {html: () => html}));

            fileDependencies.add(getWebpackModule(templateModuleId).resource);
          } else {
            completeHtml = html;
          }

          webpackModule.fileDependencies = Array.from(fileDependencies);

          const asset = {
            source: () => completeHtml,
            size: () => completeHtml.length,
            $,
            title
          };

          return asset;
        };

        try {
          const mainSource = compilation.assets[files[0]].source();

          const filename = chunk.entryModule.resource;
          const m = new Module(filename, chunk.entryModule);
          m.paths = Module._nodeModulePaths(chunk.entryModule.context);
          m.filename = filename;
          m._compile(`module.exports = ${mainSource}`, filename);
          const main = m.exports;

          bookRequire = main.require;
          const modules = bookRequire.m;
          const installedModules = bookRequire.c;
          Object.keys(modules).forEach((moduleId) => {
            // TODO why are modules that throw errors ending up in the cache?
            if (installedModules[moduleId] && !installedModules[moduleId].l) {
              delete installedModules[moduleId];
            }
            const mod = bookRequire(moduleId);
            if (mod) {
              const pages = [];
              if (mod.html && mod.url && !mod.isTemplate && mod.emit !== false) {
                pages.push(mod);
              }
              if (mod.renderPages) {
                pages.push(...mod.renderPages);
              }
              if (pages.length > 0) {
                const webpackMod = getWebpackModule(moduleId);
                let assets = webpackMod[BOOK_ASSETS];
                if (!assets) {
                  assets = {};
                  pages.forEach((page) => assets[page.url] = createAsset(moduleId, page, webpackMod));
                  if (this.options.cachePages) {
                    webpackMod[BOOK_ASSETS] = assets;
                  }
                }
                Object.assign(compilation.assets, assets);
              }
            }
          });
          delete compilation.assets[files[0]];
        } catch (e) {
          e.details = e.stack;
          compilation.errors.push(e);
        }

        return false;
      });

      callback();
    });
  }
};
