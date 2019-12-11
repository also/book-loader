import loaderUtils from 'loader-utils';
import Token from 'markdown-it/lib/token';

import {
  create,
  preprocess,
  replace,
  postprocess,
  generator,
  Env,
} from './template';

type Attr = [string, string];

type Token = {
  type: string;
  attrs: Attr[];
  content: string;
  children: Token[];
  // an option we added
  templated?: boolean;
};

function urlJs(url: string): string | null {
  if (!loaderUtils.isUrlRequest(url)) {
    return null;
  }
  url = loaderUtils.urlToRequest(url);
  const [path, hash] = url.split('#');
  let result = `book.pageUrl(${JSON.stringify(path)})`;
  if (hash) {
    result += ` + '#' + ${JSON.stringify(hash)}`;
  }
  return result;
}

function splitJavaScriptTokens(token: Token): Token[] {
  return Array.from(generator(token.content), ({ raw, js }) => {
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

function replaceJavaScriptAttrs(attrs: Attr[], env: Env): Attr[] {
  return attrs.map(([name, value]) => {
    if (name === 'src' || name === 'href') {
      const replacement = urlJs(value);
      if (replacement) {
        value = replace(env, replacement);
      }
    }

    return [name, value] as Attr;
  });
}

function expandJavaScriptTokens(tokens: Token[], env: Env): Token[] {
  return ([] as Token[]).concat(
    ...tokens.map(token => {
      if (token.attrs) {
        token.attrs = replaceJavaScriptAttrs(token.attrs, env);
      }
      const { type } = token;
      if (type === 'html_block' || type === 'text' || type === 'html_inline') {
        return splitJavaScriptTokens(token);
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
    })
  );
}

// => <p><javascript/></p> -> <javascript/>
function promoteBlockJavaScript(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (i < tokens.length - 2) {
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      if (
        open.type === 'paragraph_open' &&
        inline.type === 'inline' &&
        inline.children.length === 1 &&
        inline.children[0].type === 'javascript' &&
        close.type === 'paragraph_close'
      ) {
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
  state.tokens = promoteBlockJavaScript(
    expandJavaScriptTokens(state.tokens, state.env)
  );
}

export default function(md) {
  md.core.ruler.push('js-template', templateTokenize);

  md.renderer.rules.javascript = (tokens, idx, options, env) =>
    replace(env, tokens[idx].content);

  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    if (token.templated) {
      options = { ...options, highlight: false };
    }
    return fence(tokens, idx, options, env, slf);
  };

  const render = md.renderer.render;
  md.renderer.render = (tokens, options, env) =>
    postprocess(env, render.call(md.renderer, tokens, options, env));
}
