import path from 'path';
import loaderUtils from 'loader-utils';
import fm from 'front-matter';
import markdownJsTemplate from './markdown-js-template';
import {apply as jsTemplate} from './template';
import markdownIt from 'markdown-it';
import pageModuleTemplate from './page-module-template';

module.exports = function bookLoader(content: string): string {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);
  const {toc} = query;

  const {attributes, body} = fm<{[key: string]: any}>(content);

  if (query.markdown === false || attributes.markdown === false) {
    content = jsTemplate(body);
  } else {
    const {bookLoaderOptions = {}} = this;
    const md = markdownIt(
      Object.assign({html: true}, bookLoaderOptions.markdownOptions),
    ).use(markdownJsTemplate);
    if (bookLoaderOptions.markdownPlugins) {
      bookLoaderOptions.markdownPlugins.forEach(md.use.bind(md));
    }
    content = md.render(body);
  }

  const context = query.context || this.options.context;

  const url = attributes.hasOwnProperty('url')
    ? attributes.url
    : loaderUtils.interpolateName(this, query.name || '[path][name].html', {
        context,
        content: content,
        regExp: query.regExp,
      });

  const template = attributes.hasOwnProperty('template')
    ? attributes.template
    : query.template;

  const emit = !![attributes.emit, query.emit, url].find(
    (o) => typeof o !== 'undefined',
  );

  return pageModuleTemplate({
    url,
    template,
    toc,
    attributes,
    emit,
    filename: path.relative(context, this.resourcePath),
    renderFunctionBody: content,
  });
};
