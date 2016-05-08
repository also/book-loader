const Module = require("module");

module.exports = class BookPlugin {
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

      function addAsset({url, html}) {
        try {
          html = html(true);
        } catch (e) {
          e.file = url;
          compilation.errors.push(e);
          html = `build error`;
        }
        compilation.assets[url] = {
          source: () => html,
          size: () => html.length
        };
      }

      const main = eval(mainSource);
      if (!main.require) {
        return callback(new Error('Entry point is not a page'));
      }
      for (let i = 0; i < main.require.m.length; i++) {
        const mod = main.require(i);
        if (mod.html && mod.url) {
          addAsset(mod);
        }
      }

      compilation.chunks.pop();
      delete compilation.assets[files[0]];

      callback();
    });
  }
};
