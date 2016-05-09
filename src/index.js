const path = require('path');
const loaderUtils = require('loader-utils');
const fm = require('front-matter');
const template = require('./markdown-js-template');
const helpers = require('./helpers');


const md = require('markdown-it')({html: true}).use(template);

module.exports = function bookLoader(content) {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);

  const {attributes, body} = fm(content);
  content = md.render(body);

  const context = query.context || this.options.context;

  const url = loaderUtils.interpolateName(this, query.name || '[path][name].html', {
    context,
		content: content,
		regExp: query.regExp
	});

  return `const helpers = require('book-loader/helpers');
${Object.keys(helpers).map((k) => `const ${k} = helpers.${k};`).join('\n')}

exports.toString = () => __webpack_public_path__ + ${JSON.stringify(url)};

exports.url = ${JSON.stringify(url)};

exports.filename = ${JSON.stringify(path.relative(context, this.resourcePath))};

exports.attributes = ${JSON.stringify(attributes, null, 2)};

exports.html = (context) => ${content};

exports.template = ${query.template ? `require(${JSON.stringify(query.template)})` : 'undefined'};

exports.isTemplate = ${query.template === this.resourcePath || query.isTemplate || false};

exports.require = __webpack_require__;
`;
}
