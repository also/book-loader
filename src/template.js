function create() {
  return {jsTemplateReplacements: []};
}

function createTemplatePattern() {
  return /<%(=|-)([\s\S]+?)%>/g;
}

function preprocess(env, content) {
  if (!content.replace) {
    return content;
  }
  return content.replace(createTemplatePattern(), (match, type, js) => {
    if (type === '-') {
      js = `escapeHtml(${js})`;
    }
    return replace(env, js);
  });
}

function replace(env, js) {
  env.jsTemplateReplacements.push(js);
  return `~~ replacement ${env.jsTemplateReplacements.length - 1} ~~`;
}

function postprocess(env, content) {
  const replacements = env.jsTemplateReplacements;
  return content.split(/~~ replacement (\d+) ~~/g)
    .map((s, i) => {
      return (i % 2 == 0) ? JSON.stringify(s) : `(${replacements[parseInt(s)]})`;
    })
    .join(' +\n    ');
}

function* generator(s) {
  const parts = s.split(createTemplatePattern());
  for (let i = 0; i < parts.length; i += 3) {
    const raw = parts[i];
    if (raw.length > 0) {
      yield {raw};
    }
    const type = parts[i + 1];
    if (type) {
      const rawJs = parts[i + 2];
      const js = type === '-'
        ? `escapeHtml(${rawJs})`
        : rawJs;
      yield {js, rawJs};
    }
  }
}

function apply(s) {
  return Array.from(generator(s), ({js, raw}) => js ? `(${js})` : JSON.stringify(raw)).join(' +\n    ');
}

Object.assign(exports, {
  createTemplatePattern,
  preprocess,
  replace,
  postprocess,
  create,
  generator,
  apply
});
