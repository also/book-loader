const Module = require('module');
const cheerio = require('cheerio');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
import PageUrlPlugin from './PageUrlPlugin';
import {Page, Toc, createAsset} from './pages';

const PageUrlDependency = require('./PageUrlDependency');

const BOOK_ASSETS = Symbol('BOOK_ASSETS');
export const TOC = Symbol('TOC');

export type WebpackModuleId = number | string;

export type Options = {
  entry: string[];
  generateOutline?: boolean;
  cachePages?: boolean;
  removeTitleElt?: boolean;
};

export type WebpackModule = {
  id: WebpackModuleId;
  loaders: {loader: string}[];
  dependencies: {module?: WebpackModule};
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

export type WebpackError = Error & {module?: any};

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
          Array.from(
            chunk.modulesIterable,
            (mod) => ['' + mod.id, mod] as [string, WebpackModule],
          ),
        );

        function getWebpackModule(id: WebpackModuleId): WebpackModule {
          const result = modulesById.get('' + id);
          if (!result) {
            throw new Error('missing webpack module');
          }
          return result;
        }

        try {
          const bookRequire = compile(compilation, chunk).require;

          const renderContext = {
            options,
            compilation,
            bookRequire,
            getWebpackModule,
          };

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
                      (assets[page.url] = createAsset(
                        renderContext,
                        page,
                        webpackMod,
                      )),
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
