import PageUrlDependency from './PageUrlDependency';

export default class PageUrlPlugin {
  apply(compiler) {
    compiler.plugin('compilation', (compilation, {normalModuleFactory}) => {
      compilation.dependencyFactories.set(
        PageUrlDependency,
        normalModuleFactory,
      );
      compilation.dependencyTemplates.set(
        PageUrlDependency,
        new PageUrlDependency.Template(),
      );
    });

    compiler.plugin('compilation', (_, {normalModuleFactory}) => {
      normalModuleFactory.plugin('parser', (parser) => {
        parser.plugin('call book.pageUrl', function(expr) {
          var param = this.evaluateExpression(expr.arguments[0]);
          if (param.isString()) {
            var dep = new PageUrlDependency(param.string, expr.range);
            dep.loc = expr.loc;
            this.state.current.addDependency(dep);
            return true;
          }
        });
      });
    });
  }
}
