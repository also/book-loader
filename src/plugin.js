const Module = require('module');
const cheerio = require('cheerio');
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

const PageUrlDependency = require('./PageUrlDependency');


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

        let bookRequire;

        function addAsset(mod) {
          let {url, html, attributes={}, template, toc} = mod;
          const publicUrl = mod.toString();

          let pages = [];

          if (toc != null) {
            const tocModule = bookRequire(toc);
            if (tocModule.pages) {
              pages = tocModule.pages;
            } else {
              const $ = cheerio.load(tocModule.html());
              pages = tocModule.pages = $('a').toArray().map((a) => {
                a = $(a);
                return {url: a.attr('href'), title: a.text()};
              });
            }
          }

          const pageIndex = pages.findIndex(({url: tocUrl}) => publicUrl === tocUrl);
          let previous, next;
          if (pageIndex !== -1) {
            previous = pages[pageIndex - 1];
            next = pages[pageIndex + 1];
          }

          // attributes is optional to return, but required for templates
          mod = Object.assign({}, mod, {previous, next, attributes, options});

          try {
            html = html(mod);
          } catch (e) {
            e.file = url;
            e.details = e.stack;
            compilation.errors.push(e);
            html = `build error`;
          }

          const $ = cheerio.load(html);

          let {title} = attributes;
          if (!title) {
            const titleElt = $('h1, h2');
            if (titleElt.length === 0) {
              const e = new Error(`No h1 or h2 or title attribute`);
              e.file = url;
              compilation.warnings.push(e);
            } else {
              title = titleElt.first().text();
            }
          }

          if (template) {
            html = template.html(Object.assign({}, mod, {title, html: () => html}));
          }

          compilation.assets[url] = {
            source: () => html,
            size: () => html.length,
            $,
            title
          };
        }

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
          Object.keys(modules).forEach((k) => {
            // TODO why are modules that throw errors ending up in the cache?
            if (installedModules[k] && !installedModules[k].l) {
              delete installedModules[k];
            }
            const mod = bookRequire(k);
            if (mod) {
              if (mod.html && mod.url && !mod.isTemplate && mod.emit !== false) {
                addAsset(mod);
              }
              if (mod.renderPages) {
                mod.renderPages.forEach((page) => addAsset(page));
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
