const Module = require("module");

module.exports = class BookPlugin {
  constructor(options) {

  }

  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const chunk0 = compilation.chunks[0];
      if (!chunk0) {
        // something went wrong. bail without error, something else will show up
        return callback();
      }

      const {files} = chunk0;
      if (files.length !== 1) {
        return callback(new Error('Expected 1 file output for chunk 0'));
      }

      const mainSource = compilation.assets[files[0]].source();

      function addAsset({url, html, deps}) {
        if (compilation.assets[url]) {
          return;
        }
        html = html();
        compilation.assets[url] = {
          source: () => html,
          size: () => html.length
        };
        deps().forEach(({path, module}) => {
          if (module.deps) {
            addAsset(module);
          }
        });
      }

      try {
        addAsset(eval(mainSource));
      } catch (e) {
        callback(e);
      }

      compilation.chunks.pop();
      delete compilation.assets[files[0]];

      callback();
    });
  }
};
