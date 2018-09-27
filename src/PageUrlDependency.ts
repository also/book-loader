const ModuleDependency = require('webpack/lib/dependencies/ModuleDependency');

class PageUrlDependencyTemplate {
  apply(dep, source, outputOptions, requestShortener) {
    const comment = outputOptions.pathinfo
      ? `/*! ${requestShortener.shorten(dep.request)} */ `
      : '';

    const content = dep.module
      ? comment + `__webpack_require__(${JSON.stringify(dep.module.id)})`
      : JSON.stringify(dep.request);

    source.replace(dep.range[0], dep.range[1] - 1, content);
  }
}

export default class PageUrlDependency extends ModuleDependency {
  static Template = PageUrlDependencyTemplate;
  constructor(request, range) {
    super(request);
    this.range = range;
    this.optional = true;
    this.weak = false;
  }
}

PageUrlDependency.prototype.type = 'book.pageUrl';
