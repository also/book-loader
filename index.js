// TODO look into other markdown libraries: markdown-it, ...
const marked = require('marked');
const loaderUtils = require('loader-utils');
const URI = require('urijs');


class PageRenderer extends marked.Renderer {
  constructor(publicPath) {
    super();
    this.replacements = [];
  }

  replacement(js) {
    this.replacements.push(js);
    return `<!-- ~~ replacement ${this.replacements.length - 1} ~~ -->`;
  }

  preprocess(content) {
    return content.replace(/<%=([\s\S]+?)%>/g, (match, js) => this.replacement(js));
  }

  postprocess(content) {
    return content.split(/(?:&lt;|<)!-- ~~ replacement (\d+) ~~ --(?:&gt;|>)/g)
      .map((s, i) => {
        return (i % 2 == 0) ? JSON.stringify(s) : this.replacements[parseInt(s)]
      })
      .join(' + ');
  }

  resolveUrl(url) {
    if (!loaderUtils.isUrlRequest(url)) {
      return url;
    }
    url = loaderUtils.urlToRequest(url);
    const [path, hash] = url.split('#');
    return this.replacement(`require(${JSON.stringify(path)})${hash ? ` + '#' + ${JSON.stringify(hash)}` : ''}`);
  }

  link(url, ...args) {
    return super.link(this.resolveUrl(url), ...args);
  }

  image(url, ...args) {
    return super.image(this.resolveUrl(url), ...args);
  }
}

module.exports = function bookLoader(content) {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);

  const renderer = new PageRenderer();
  content = renderer.preprocess(content);
  content = marked(content, {gfm: true, renderer});
  content = renderer.postprocess(content);

  const url = loaderUtils.interpolateName(this, query.name || '[path][name].html', {
    context: query.context || this.options.context,
		content: content,
		regExp: query.regExp
	});

  let htmlKey = 'html';
  if (query.template) {
    if (query.template === this.resourcePath) {
      htmlKey = 'template';
    } else {
      content = `context
      ? require(${JSON.stringify(query.template)}).template(Object.assign(Object.create(exports), {html: (context) => ${content}}))
      : ${content}`
    }
  }

  return `Object.assign(exports, {
  toString: () => __webpack_public_path__ + ${JSON.stringify(url)},
  url: ${JSON.stringify(url)},
  ${htmlKey}: (context) => ${content},
  require: __webpack_require__
})`;
}
