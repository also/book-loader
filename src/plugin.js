const Module = require('module');
const webpack = require('webpack');
const cheerio = require('cheerio');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');

const transformToc = require('./outline');
const PageUrlDependency = require('./PageUrlDependency');

const BOOK_ASSETS = Symbol('BOOK_ASSETS');
const TOC = Symbol('TOC');

module.exports = class BookPlugin {
  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    const {options} = this;
    compiler.apply(new webpack.DefinePlugin({BOOK_LOADER_DIR: JSON.stringify(__dirname)}));
    options.entry.forEach((entry) => {
      compiler.apply(new MultiEntryPlugin(compiler.options.context, [entry, require.resolve('./entry')], `book-loader-${entry}`));
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
        if (!chunk.entryModule.dependencies[1].module.resource.includes('book-loader/entry')) {
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
          let toc;
          if (tocs.has(tocModuleId)) {
            toc = tocs.get(tocModuleId);
            if (!toc) {
              // the toc threw an error
              return null;
            }
          } else {
            toc = webpackModule[TOC];
          }
          if (!toc) {
            try {
              const page = bookRequire(tocModuleId);
              const html = page.html();
              const $ = cheerio.load(html);
              const pages = $('a').toArray().map((a) => {
                a = $(a);
                return {url: a.attr('href'), title: a.text()};
              });

              if (options.generateOutline) {
                page.outline = transformToc($);
                page.breadcrumbs = transformToc.generateBreadcrumbs(page.outline);
              }

              toc = {
                html,
                $,
                pages,
                page,
                webpackModule
              };
              tocs.set(tocModuleId, toc);

              if (options.cachePages) {
                webpackModule[TOC] = toc;
              }

              compilation.applyPlugins1('book-toc-rendered', toc);
            } catch (e) {
              tocs.set(tocModuleId, null);
              e.module = webpackModule;
              compilation.errors.push(e);
              // throw new Error('Error building TOC');
            }
          }

          return toc;
        };

        let bookRequire;

        const render = (page) => {
          const {renderer, webpackModule} = page;
          const moduleId = webpackModule.id.toString();

          const fileDependencies = new Set(webpackModule.fileDependencies);
          let {html, attributes={}, template: templateModuleId, toc: tocModuleId} = renderer;
          const publicUrl = renderer.toString();

          // the page with some extra attributes for the template
          const renderingPage = Object.assign({}, renderer);

          const basename = publicUrl.split('/').pop();
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

          if (tocModuleId != null) {
            const toc = getToc(tocModuleId);
            if (toc) {
              renderingPage.toc = toc.page;
              fileDependencies.add(toc.webpackModule.resource);

              const pageIndex = toc.pages.findIndex(({url: tocUrl}) => publicUrl === tocUrl);

              if (pageIndex !== -1) {
                renderingPage.previous = toc.pages[pageIndex - 1];
                renderingPage.next = toc.pages[pageIndex + 1];
              }
            }
          }

          let {title, titleHtml=title} = attributes;
          if (!title) {
            if (tocs.has(moduleId)) {
              title = 'Table of Contents';
            } else {
              const titleElts = $('h1, h2');
              if (titleElts.length === 0) {
                const e = new Error(`No h1 or h2 or title attribute`);
                e.module = webpackModule;
                compilation.warnings.push(e);
              } else {
                const titleElt = titleElts.first();
                title = titleElt.text();
                titleHtml = titleElt.html();
                if (options.removeTitleElt) {
                  titleElt.remove();
                  html = $.html($.root());
                }
              }
            }
          }

          renderingPage.title = title;
          renderingPage.titleHtml = titleHtml;

          let completeHtml = html;
          if (templateModuleId) {
            const templateWebpackModule = getWebpackModule(templateModuleId);
            try {
              const templatePage = bookRequire(templateModuleId);
              completeHtml = templatePage.html(Object.assign({}, renderingPage, {html: () => html}));
            } catch (e) {
              e.module = templateWebpackModule;
              compilation.errors.push(e);
            }

            fileDependencies.add(templateWebpackModule.resource);
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

        function pagesForModule(mod, webpackModule) {
          const pages = [];
          if (mod.html && mod.url && !mod.isTemplate && mod.emit !== false) {
            pages.push({renderer: mod, webpackModule});
          }
          if (mod.renderPages) {
            pages.push(...mod.renderPages.map(renderer => ({renderer, webpackModule})));
          }
          return pages;
        }

        try {
          const mainSource = compilation.assets[files[0]].source();

          const filename = chunk.entryModule.dependencies[0].module.resource;
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
              const webpackMod = getWebpackModule(moduleId);
              let assets = webpackMod[BOOK_ASSETS];
              if (!assets) {
                assets = {};
                pagesForModule(mod, webpackMod).forEach((page) => assets[page.renderer.url] = render(page));
                if (options.cachePages) {
                  webpackMod[BOOK_ASSETS] = assets;
                }
              }
              Object.assign(compilation.assets, assets);
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
