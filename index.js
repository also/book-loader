// TODO look into other markdown libraries: markdown-it, ...
const marked = require('marked');
const loaderUtils = require('loader-utils');
const URI = require('urijs');


class PageRenderer extends marked.Renderer {
  constructor(publicPath) {
    super();
    this.references = [];
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
    const {replacements} = this;
    return content.split(/(?:&lt;|<)!-- ~~ replacement (\d+) ~~ --(?:&gt;|>)/g)
      .map((s, i) => {
        return (i % 2 == 0) ? JSON.stringify(s) : replacements[parseInt(s)]
      })
      .join(' + ');
  }

  resolveUrl(url, ref=true) {
    if (!loaderUtils.isUrlRequest(url)) {
      return url;
    }
    if (!url.match(/$(\/|..?\/)/)) {
      url = `./${url}`;
    }
    if (ref) {
      this.references.push(url);
    }
    return this.replacement(`require(${JSON.stringify(url)})`);
  }

  link(url, ...args) {
    return super.link(this.resolveUrl(url), ...args);
  }

  image(url, ...args) {
    return super.image(this.resolveUrl(url, false), ...args);
  }
}

module.exports = function bookLoader(content) {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);

  const renderer = new PageRenderer();
  content = renderer.preprocess(content);
  content = marked(content, {gfm: true, renderer});
  content = renderer.postprocess(content);

  const deps = renderer.references.map((ref) => `{path: ${JSON.stringify(ref)}, module: require(${JSON.stringify(ref)})}`).join(',\n    ');

  const url = loaderUtils.interpolateName(this, query.name || '[path][name].html', {
    context: query.context || this.options.context,
		content: content,
		regExp: query.regExp
	});

  return `Object.assign(exports, {
  toString: () => __webpack_public_path__ + ${JSON.stringify(url)},
  url: ${JSON.stringify(url)},
  html: () => ${content},
  deps: () => [
    ${deps}
  ]
})`;
}
