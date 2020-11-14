import {
  WebpackModule,
  WebpackCompilation,
  Options,
  WebpackModuleId,
  TOC,
  WebpackError,
} from './plugin';
import { transformToc, generateBreadcrumbs } from './outline';
import cheerio from 'cheerio';

export type Toc = {
  html: string;
  $: any;
  page: Page;
  pages: TocPageInfo[];
  webpackModule: WebpackModule;
};

export type Page = {
  url: string;
  html: (p: RenderingPage) => string;
  attributes: { [key: string]: any };
  template: WebpackModuleId;
  toc: WebpackModuleId;
};

export type RenderedPage = {
  filename: string;
  html: string;
  title: string;
  $: any;
  attributes: { [key: string]: any };
};

type TocPageInfo = { url: string; title: string };

type RenderingPage = {
  url: string;
  attributes: { [key: string]: any };
  toc?: Page;
  previous?: TocPageInfo;
  next?: TocPageInfo;
  options: Options;
};

type RenderingPageForTemplate = {
  url: string;
  title: string;
  titleHtml: string;
  html: () => string;
  $: any;
  attributes: { [key: string]: any };
  toc?: Page;
  previous?: TocPageInfo;
  next?: TocPageInfo;
  options: Options;
};

type RenderContext = {
  options: Options;
  compilation: WebpackCompilation;
  bookRequire: any;
  getWebpackModule: (id: WebpackModuleId) => WebpackModule;
};

const TOCS = Symbol('TOCS');

const RENDERED_PAGE = Symbol('RENDERED_PAGE');
export const WEBPACK_MODULE = Symbol('WEBPACK_MODULE');

export function render(
  context: RenderContext,
  page: Page,
  webpackModule?: WebpackModule
): RenderingPageForTemplate {
  let result = page[RENDERED_PAGE];

  if (!result) {
    if (!webpackModule) {
      webpackModule = page[WEBPACK_MODULE];
    }
    if (!webpackModule) {
      throw new Error('missing WEBPACK_MODULE');
    }
    const { options, compilation } = context;
    const fileDependencies = new Set(webpackModule.fileDependencies);
    let { attributes = {}, toc: tocModuleId } = page;
    const publicUrl = page.toString();

    // the page with some extra attributes for the template
    const renderingPage: RenderingPage = Object.assign({}, page, {
      toc: undefined,
      options,
    });

    if (tocModuleId != null) {
      const toc = getToc(context, tocModuleId);
      if (toc) {
        renderingPage.toc = toc.page;
        fileDependencies.add(toc.webpackModule.resource);

        const pageIndex = toc.pages.findIndex(
          ({ url: tocUrl }) => publicUrl === tocUrl
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
        attributes = { date: dateMatch[1], ...attributes };
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

    let { title, titleHtml = title } = attributes;
    if (!title) {
      if (getTocs(context).has(webpackModule.id.toString())) {
        title = 'Table of Contents';
      } else {
        const titleElts = $('h1, h2');
        if (titleElts.length === 0) {
          const e: WebpackError = new Error(`No h1 or h2 or title attribute`);
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

    webpackModule.fileDependencies = Array.from(fileDependencies);

    result = {
      ...renderingPage,
      title,
      titleHtml,
      html: () => html,
      $,
    };
    page[RENDERED_PAGE] = result;
  }
  return result;
}

export function createAsset(
  context: RenderContext,
  page: Page,
  webpackModule: WebpackModule
): RenderedPage {
  const { compilation, getWebpackModule, bookRequire } = context;
  let { template: templateModuleId } = page;
  const fileDependencies = new Set(webpackModule.fileDependencies);

  const renderingPageForTemplate = render(context, page, webpackModule);

  let completeHtml = renderingPageForTemplate.html();
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

  return {
    filename: webpackModule.resource,
    html: completeHtml,
    $: renderingPageForTemplate.$,
    title: renderingPageForTemplate.title,
    attributes: renderingPageForTemplate.attributes,
  };
}

function getTocs(context: RenderContext): Map<string, Toc | null> {
  let tocs: Map<string, Toc | null> = context[TOCS];
  if (!tocs) {
    tocs = context[TOCS] = new Map();
  }
  return tocs;
}

function getToc(context: RenderContext, tocModuleId: WebpackModuleId) {
  tocModuleId = tocModuleId + '';
  const { options, compilation, bookRequire, getWebpackModule } = context;
  const webpackModule = getWebpackModule(tocModuleId);
  let toc: Toc | null | undefined;

  const tocs = getTocs(context);

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
        .map(a => {
          a = $(a);
          return { url: a.attr('href'), title: a.text() };
        });

      if (options.generateOutline) {
        page.outline = transformToc($);
        page.breadcrumbs = generateBreadcrumbs(page.outline);
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

      if (options.onBookTocRendered) {
        options.onBookTocRendered(toc);
      }
    } catch (e) {
      tocs.set(tocModuleId, null);
      e.module = webpackModule;
      compilation.errors.push(e);
      // throw new Error('Error building TOC');
    }
  }

  return toc;
}
