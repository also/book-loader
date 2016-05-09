exports.toString = () => __webpack_public_path__ + exports.url;

exports.url = 'js-module.html';

exports.html = () => `
<h1>JavaScript Module</h1>

<p>You can create pages with JavaScript.</p>
`;

exports.template = require('./template.md');
