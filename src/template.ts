export type Env = {
  jsTemplateReplacements: string[]
};

type EnvThing = {
  js?: string
  raw?: string
  rawJs?: string
};

export function create(): Env {
  return {jsTemplateReplacements: []};
}

export function createTemplatePattern(): RegExp {
  return /<%(=|-)([\s\S]+?)%>/g;
}

export function preprocess(env: Env, content) {
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

export function replace(env: Env, js: string) {
  env.jsTemplateReplacements.push(js);
  return `~~ replacement ${env.jsTemplateReplacements.length - 1} ~~`;
}

export function postprocess(env: Env, content: string) {
  const replacements = env.jsTemplateReplacements;
  return content.split(/~~ replacement (\d+) ~~/g)
    .map((s, i) => {
      return (i % 2 == 0) ? JSON.stringify(s) : `(${replacements[parseInt(s)]})`;
    })
    .join(' +\n    ');
}

export function* generator(s: string): Iterable<EnvThing> {
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

export function apply(s: string): string {
  return Array.from(generator(s), ({js, raw}) => js ? `(${js})` : JSON.stringify(raw)).join(' +\n    ');
}
