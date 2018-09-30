const Module = require('module');
const cheerio = require('cheerio');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
import PageUrlPlugin from './PageUrlPlugin';

const transformToc = require('./outline');
const PageUrlDependency = require('./PageUrlDependency');

const BOOK_ASSETS = Symbol('BOOK_ASSETS');
const TOC = Symbol('TOC');

type Options = {
  entry: string[];
  generateOutline?: boolean;
  cachePages?: boolean;
  removeTitleElt?: boolean;
};

type WebpackModule = {
  id: number | string;
  loaders: {loader: string}[];
  dependencies: {module?: WebpackModule};
  resource: string;
  context: string;
  fileDependencies: string[];
};

type WebpackChunk = {
  name: string;
  modules: WebpackModule[];
  entryModule: WebpackModule;
  files: any;
};

type WebpackAsset = {
  source: () => string;
};

type Toc = {
  html: string;
  $: any;
  page: Page;
  pages: TocPageInfo[];
  webpackModule: WebpackModule;
};

type WebpackCompilation = {
  chunks: WebpackChunk[];
  errors: any[];
  warnings: any[];
  assets: {[filename: string]: WebpackAsset};
  files: any[];
  applyPlugins1: any;
  plugin: any;
};

type WebpackRuntimeModule = {
  // l=loaded
  l: boolean;
};
type CompiledModule = {};

type WebpackRequire = ((string) => CompiledModule) & {
  m: {[moduleId: string]: WebpackRuntimeModule};
  c: {[moduleId: string]: WebpackRuntimeModule};
};

type Page = {
  url: string;
  html: (p: RenderingPage) => string;
  attributes: {[key: string]: any};
  template: string;
  toc: string;
};

type TocPageInfo = {url: string; title: string};

type RenderingPage = {
  url: string;
  attributes: {[key: string]: any};
  toc?: Page;
  previous?: TocPageInfo;
  next?: TocPageInfo;
  options: Options;
};

type RenderingPageForTemplate = {
  url: string;
  title: string;
  titleHtml: string;
  html: (p: RenderingPage) => string;
  attributes: {[key: string]: any};
  toc?: Page;
  previous?: TocPageInfo;
  next?: TocPageInfo;
  options: Options;
};

type WebpackError = Error & {module?: any};

module.exports = class BookPlugin {
  options: Options;

  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    new PageUrlPlugin().apply(compiler);
    const {options} = this;
    let i = 0;
    options.entry.forEach((entry) => {
      compiler.apply(
        new MultiEntryPlugin(
          compiler.options.context,
          [entry, require.resolve('./entry')],
          `book-loader-entry-${i++}`,
        ),
      );
    });

    compiler.plugin('compilation', (compilation, {normalModuleFactory}) => {
      compilation.plugin('normal-module-loader', (context) => {
        context.bookLoaderOptions = options;
      });
    });

    compiler.plugin(
      'compilation',
      (compilation: WebpackCompilation, {normalModuleFactory}) => {
        compilation.plugin('build-module', (mod: WebpackModule) => {
          // remove cached assets when a module is rebuilt
          delete mod[BOOK_ASSETS];
          delete mod[TOC];
        });
      },
    );

    compiler.plugin('emit', (compilation: WebpackCompilation, callback) => {
      compilation.chunks = compilation.chunks.filter((chunk) => {
        if (!chunk.name.startsWith('book-loader-entry-')) {
          return true;
        }

        const {files} = chunk;
        if (files.length !== 1) {
          return true;
        }

        const modulesById: Map<string, WebpackModule> = new Map(
          chunk.modules.map(
            (mod) => ['' + mod.id, mod] as [string, WebpackModule],
          ),
        );

        function getWebpackModule(id: string): WebpackModule {
          const result = modulesById.get('' + id);
          if (!result) {
            throw new Error('missing webpack module');
          }
          return result;
        }

        // TODO why null instead of unset?
        const tocs: Map<string, Toc | null> = new Map();

        const getToc = (tocModuleId) => {
          tocModuleId = '' + tocModuleId;
          const webpackModule = getWebpackModule(tocModuleId);
          let toc: Toc | null | undefined;
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
              const pages = $('a')
                .toArray()
                .map((a) => {
                  a = $(a);
                  return {url: a.attr('href'), title: a.text()};
                });

              if (options.generateOutline) {
                page.outline = transformToc($);
                page.breadcrumbs = transformToc.generateBreadcrumbs(
                  page.outline,
                );
              }

              toc = {
                html,
                $,
                pages,
                page,
                webpackModule,
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

        const createAsset = (page: Page, webpackModule: WebpackModule) => {
          const fileDependencies = new Set(webpackModule.fileDependencies);
          let {
            attributes = {},
            template: templateModuleId,
            toc: tocModuleId,
          } = page;
          const publicUrl = page.toString();

          // the page with some extra attributes for the template
          const renderingPage: RenderingPage = Object.assign({}, page, {
            toc: undefined,
            options,
          });

          if (tocModuleId != null) {
            const toc = getToc(tocModuleId);
            if (toc) {
              renderingPage.toc = toc.page;
              fileDependencies.add(toc.webpackModule.resource);

              const pageIndex = toc.pages.findIndex(
                ({url: tocUrl}) => publicUrl === tocUrl,
              );

              if (pageIndex !== -1) {
                renderingPage.previous = toc.pages[pageIndex - 1];
                renderingPage.next = toc.pages[pageIndex + 1];
              }
            }
          }

          const basename = webpackModule.resource.split('/').pop();
          if (basename) {
            const dateMatch = basename.match(/(^\d{4}-\d{2}-\d{2})-/);

            if (dateMatch) {
              attributes = {date: dateMatch[1], ...attributes};
            }
          }

          renderingPage.attributes = attributes;

          let html: string;
          try {
            html = page.html(renderingPage);
          } catch (e) {
            e.module = webpackModule;
            e.details = e.stack;
            compilation.errors.push(e);
            html = `build error`;
          }

          const $ = cheerio.load(html);

          let {title, titleHtml = title} = attributes;
          if (!title) {
            if (tocs.has(webpackModule.id.toString())) {
              title = 'Table of Contents';
            } else {
              const titleElts = $('h1, h2');
              if (titleElts.length === 0) {
                const e: WebpackError = new Error(
                  `No h1 or h2 or title attribute`,
                );
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

          const renderingPageForTemplate: RenderingPageForTemplate = {
            ...renderingPage,
            title,
            titleHtml,
            html: () => html,
          };

          let completeHtml = html;
          if (templateModuleId) {
            const templateWebpackModule = getWebpackModule(templateModuleId);
            try {
              const templatePage: Page = bookRequire(templateModuleId);
              completeHtml = templatePage.html(renderingPageForTemplate);
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
            title,
          };

          return asset;
        };

        try {
          const mainSource: string = compilation.assets[files[0]].source();

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
              const pages: Page[] = [];
              if (
                mod.html &&
                mod.url &&
                !mod.isTemplate &&
                mod.emit !== false
              ) {
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
                  pages.forEach(
                    (page) =>
                      (assets[page.url] = createAsset(page, webpackMod)),
                  );
                  if (options.cachePages) {
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
