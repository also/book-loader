const path = require('path');
const loaderUtils = require('loader-utils');
const fm = require('front-matter');
const markdownJsTemplate = require('./markdown-js-template');
const {apply: jsTemplate} = require('./template');
const helpers = require('./helpers');
const markdownIt = require('markdown-it');


module.exports = function bookLoader(content) {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);
  const {toc} = query;

  const {attributes, body} = fm(content);

  if (query.markdown === false || attributes.markdown === false) {
    content = jsTemplate(body);
  } else {
    const {bookLoaderOptions={}} = this;
    const md = markdownIt(Object.assign({html: true}, bookLoaderOptions.markdownOptions)).use(markdownJsTemplate);
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
        regExp: query.regExp
      });

  const template = attributes.hasOwnProperty('template') ? attributes.template : query.template;

  return `const helpers = require('book-loader/helpers');
${Object.keys(helpers).map((k) => `const ${k} = helpers.${k};`).join('\n')}

exports.toString = () => __webpack_public_path__ + ${JSON.stringify(url)};

exports.url = ${JSON.stringify(url)};

exports.filename = ${JSON.stringify(path.relative(context, this.resourcePath))};

exports.attributes = ${JSON.stringify(attributes, null, 2)};

exports.html = (context) => ${content};

exports.template = ${template ? `require(${JSON.stringify(template)})` : 'undefined'};

exports.toc = ${toc ? `require.resolve(${JSON.stringify(toc)})` : 'undefined'};

exports.require = __webpack_require__;
`;
}
