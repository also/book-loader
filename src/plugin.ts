const Module = require('module');
const cheerio = require('cheerio');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const webpack = require('webpack');
import PageUrlPlugin from './PageUrlPlugin';
import { Page, RenderedPage, createAsset, WEBPACK_MODULE, Toc } from './pages';

const RENDERED_PAGES = Symbol('RENDERED_PAGES');
export const TOC = Symbol('TOC');

export type WebpackModuleId = number | string;

export type Options = {
  entry: string[];
  generateOutline?: boolean;
  cachePages?: boolean;
  removeTitleElt?: boolean;
  onBookTocRendered?: (Toc) => void;
};

export type WebpackModule = {
  id: WebpackModuleId;
  loaders: { loader: string }[];
  dependencies: { module?: WebpackModule };
  resource: string;
  context: string;
  fileDependencies: string[];
};

type WebpackChunk = {
  name: string;
  modulesIterable: Iterable<WebpackModule>;
  entryModule: WebpackModule;
  files: any;
};

type WebpackAsset = {
  source: () => string;
};

export type WebpackCompilation = {
  chunks: WebpackChunk[];
  errors: any[];
  warnings: any[];
  assets: { [filename: string]: WebpackAsset };
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
  m: { [moduleId: string]: WebpackRuntimeModule };
  c: { [moduleId: string]: WebpackRuntimeModule };
};

export type WebpackError = Error & { module?: any };

type CachedPage = {
  page: Page;
  renderedPage: RenderedPage;
  asset: WebpackAsset;
};

module.exports = class BookPlugin {
  options: Options;

  constructor(options) {
    this.options = options;
  }

  apply(compiler) {
    const resolveAlias = (compiler.options.resolve.alias =
      compiler.options.resolve.alias || {});
    resolveAlias['book-loader/pages$'] = require.resolve('./pages-api');

    compiler.apply(
      new webpack.DefinePlugin({ BOOK_LOADER_DIR: JSON.stringify(__dirname) })
    );

    new PageUrlPlugin().apply(compiler);

    const { options } = this;
    let i = 0;
    options.entry.forEach(entry => {
      compiler.apply(
        new MultiEntryPlugin(
          compiler.options.context,
          [entry, require.resolve('./entry')],
          `book-loader-entry-${i++}`
        )
      );
    });

    compiler.plugin('compilation', (compilation, { normalModuleFactory }) => {
      compilation.plugin('normal-module-loader', context => {
        context.bookLoaderOptions = options;
      });
    });

    compiler.plugin(
      'compilation',
      (compilation: WebpackCompilation, { normalModuleFactory }) => {
        compilation.plugin('build-module', (mod: WebpackModule) => {
          // remove cached assets when a module is rebuilt
          delete mod[RENDERED_PAGES];
          delete mod[TOC];
        });
      }
    );

    compiler.plugin('emit', (compilation: WebpackCompilation, callback) => {
      compilation.chunks = compilation.chunks.filter(chunk => {
        if (!chunk.name.startsWith('book-loader-entry-')) {
          return true;
        }

        const { files } = chunk;
        if (files.length !== 1) {
          return true;
        }

        const modulesById: Map<string, WebpackModule> = new Map(
          Array.from(
            chunk.modulesIterable,
            mod => ['' + mod.id, mod] as [string, WebpackModule]
          )
        );

        function getWebpackModule(id: WebpackModuleId): WebpackModule {
          const result = modulesById.get('' + id);
          if (!result) {
            throw new Error('missing webpack module');
          }
          return result;
        }

        try {
          const entry = compile(compilation, chunk);

          function bookRequire(moduleId) {
            // TODO why are modules that throw errors ending up in the cache?
            if (installedModules[moduleId] && !installedModules[moduleId].l) {
              delete installedModules[moduleId];
            }
            return entry.require(moduleId);
          }

          const renderContext = {
            options,
            compilation,
            bookRequire,
            getWebpackModule,
          };

          entry.context = renderContext;

          const modules = entry.require.m;
          const installedModules = entry.require.c;
          Object.keys(modules).forEach(moduleId => {
            try {
              bookRequire(moduleId)[WEBPACK_MODULE] = getWebpackModule(
                moduleId
              );
            } catch (e) {}
          });
          Object.keys(modules).forEach(moduleId => {
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
                let renderedPages: CachedPage[] = webpackMod[RENDERED_PAGES];
                if (!renderedPages) {
                  renderedPages = pages.map(page => {
                    const renderedPage = createAsset(
                      renderContext,
                      page,
                      webpackMod
                    );
                    return {
                      renderedPage,
                      page,
                      asset: {
                        source: () => renderedPage.html,
                        size: () => renderedPage.html.length,
                        page,
                        renderedPage,
                      },
                    };
                  });
                  if (options.cachePages) {
                    webpackMod[RENDERED_PAGES] = renderedPages;
                  }
                }
                renderedPages.forEach(({ page, asset }) => {
                  compilation.assets[page.url] = asset;
                });
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

function compile(compilation: WebpackCompilation, chunk: WebpackChunk) {
  const mainSource: string = compilation.assets[chunk.files[0]].source();

  const entryModule = chunk.entryModule.dependencies[0].module;
  const filename = entryModule.resource;
  const m = new Module(filename, entryModule);
  m.paths = Module._nodeModulePaths(entryModule.context);
  m.filename = filename;
  m._compile(`module.exports = ${mainSource}`, filename);
  return m.exports;
}
