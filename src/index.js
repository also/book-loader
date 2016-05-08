const path = require('path');
const loaderUtils = require('loader-utils');
const template = require('./markdown-js-template');
const helpers = require('./helpers');

const md = require('markdown-it')({html: true}).use(template);

module.exports = function bookLoader(content) {
  this.cacheable(true);
  const query = loaderUtils.parseQuery(this.query);
  content = md.render(content);

  const context = query.context || this.options.context;

  const url = loaderUtils.interpolateName(this, query.name || '[path][name].html', {
    context,
		content: content,
		regExp: query.regExp
	});

  return `const helpers = require('book-loader/helpers');
${Object.keys(helpers).map((k) => `const ${k} = helpers.${k};`).join('\n')}

Object.assign(exports, {
  toString: () => __webpack_public_path__ + ${JSON.stringify(url)},
  url: ${JSON.stringify(url)},
  filename: ${JSON.stringify(path.relative(context, this.resourcePath))},
  html: (context) => ${content},
  template: ${query.template ? `require(${JSON.stringify(query.template)})` : 'undefined'},
  isTemplate: ${query.template === this.resourcePath || query.isTemplate || false},
  require: __webpack_require__
})`;
}
