const loaderUtils = require('loader-utils');
const MarkdownIt = require('markdown-it');
const Token = require('markdown-it/lib/token');
const {escapeHtml, arrayReplaceAt} = require('markdown-it/lib/common/utils');
const Renderer = require('markdown-it/lib/renderer');

const {
  create,
  createTemplatePattern,
  preprocess,
  replace,
  postprocess,
  generator
} = require('./template');


function urlJs(url) {
  if (!loaderUtils.isUrlRequest(url)) {
    return null;
  }
  url = loaderUtils.urlToRequest(url);
  const [path, hash] = url.split('#');
  return `(() => {try {return require(${JSON.stringify(path)})${hash ? ` + '#' + ${JSON.stringify(hash)}` : ''}} catch (e) {return ${JSON.stringify(url)}}})()`;
}

function splitJavaScriptTokens(token) {
  return Array.from(generator(token.content), ({raw, js}) => {
    let replacement;
    if (js) {
      replacement = new Token('javascript', '', 0);
      replacement.content = js;
    } else {
      replacement = Object.create(token);
      replacement.content = raw;
    }
    return replacement;
  });
}

function replaceJavaScriptAttrs(attrs, env) {
  return attrs.map(([name, value]) => {
    if (name === 'src' || name === 'href') {
      const replacement = urlJs(value);
      if (replacement) {
        value = replace(env, replacement);
      }
    }

    return [name, value];
  });
}

function expandJavaScriptTokens(tokens, env) {
  return [].concat(...tokens.map((token) => {
    if (token.attrs) {
      token.attrs = replaceJavaScriptAttrs(token.attrs, env);
    }
    const {type} = token;
    if (type === 'html_block' || type === 'text' || type === 'html_inline') {
      return splitJavaScriptTokens(token, env);
    } else if (type === 'inline') {
      token.children = expandJavaScriptTokens(token.children, env);
      return [token];
    } else if (type === 'fence') {
      const processedContent = preprocess(env, token.content);
      if (processedContent !== token.content) {
        token.content = processedContent;
        token.templated = true;
      }
      return [token];
    } else {
      return [token];
    }
  }));
}

// => <p><javascript/></p> -> <javascript/>
function promoteBlockJavaScript(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (i < tokens.length - 2) {
      const inline = tokens[i+1];
      const close = tokens[i+2];
      if (open.type === 'paragraph_open' && inline.type === 'inline'
          && inline.children.length === 1 && inline.children[0].type === 'javascript'
          && close.type === 'paragraph_close') {
        result.push(inline.children[0]);
        i += 2;
        continue;
      }
    }
    result.push(open);
  }

  return result;
}

function templateTokenize(state) {
  Object.assign(state.env, create());
  state.tokens = promoteBlockJavaScript(expandJavaScriptTokens(state.tokens, state.env));
}

module.exports = function(md) {
  md.core.ruler.push('js-template', templateTokenize);

  md.renderer.rules.javascript = (tokens, idx, options, env) => replace(env, tokens[idx].content);

  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    if (token.templated) {
      options = Object.assign({}, options, {highlight: false});
    }
    return fence(tokens, idx, options, env, slf);
  };

  const render = md.renderer.render;
  md.renderer.render = (tokens, options, env) => postprocess(env, render.call(md.renderer, tokens, options, env));
}
