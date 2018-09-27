import helpers from './helpers';

type PageModuleOptions = {
  // the url of the page, relative to the root
  url: string;
  // the body of a function (context) => ${renderFunctionBody}
  renderFunctionBody: string;
  // the filename, relative to the context
  filename: string;
  // the path to the template module
  template?: string;
  // the path to the toc
  toc?: string;
  attributes: Object;
  emit: boolean;
};

export default function renderString({
  url,
  renderFunctionBody,
  template,
  toc,
  filename,
  attributes,
  emit,
}: PageModuleOptions) {
  return `const helpers = __non_webpack_require__(${JSON.stringify(
    require.resolve('./helpers'),
  )});
${Object.keys(helpers)
    .map((k) => `const ${k} = helpers.${k};`)
    .join('\n')}

exports.toString = () => __webpack_public_path__ + ${JSON.stringify(url)};

exports.url = ${JSON.stringify(url)};

exports.emit = ${emit};

exports.filename = ${JSON.stringify(filename)};

exports.attributes = ${JSON.stringify(attributes, null, 2)};

exports.html = (context) => ${renderFunctionBody};

exports.template = ${
    template ? `require.resolve(${JSON.stringify(template)})` : 'undefined'
  };

exports.toc = ${toc ? `require.resolve(${JSON.stringify(toc)})` : 'undefined'};

exports.require = __webpack_require__;
`;
}
