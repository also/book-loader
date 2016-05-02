// TODO look into other markdown libraries: markdown-it, ...
const marked = require('marked');
const loaderUtils = require('loader-utils');
const URI = require('urijs');

class PageRenderer extends marked.Renderer {
  constructor(publicPath) {
    super();
    this.references = [];
    this.publicPath = publicPath;
  }

  resolveUrl(url) {
    if (!loaderUtils.isUrlRequest(url)) {
      return url;
    }
    if (!url.match(/$\/|..?\//)) {
      url = `./${url}`;
    }
    this.references.push(url);
    return URI(url).absoluteTo(this.publicPath).toString().replace(/\.md$/, '.html');
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

  const renderer = new PageRenderer(this._compilation.outputOptions.publicPath);

  const opts = {
    gfm: true,
    renderer
  };
  content = marked(content, opts);

  const requires = renderer.references.map((ref) => `require(${JSON.stringify(ref)});`).join('\n');

  const query = loaderUtils.parseQuery(this.query);
  const url = loaderUtils.interpolateName(this, query.name || "[name].html", {
    context: query.context || this.options.context,
    content
  });

  this.emitFile(url, content);

  return `// source removed by book loader. see ${url}\n${requires}`;
}
