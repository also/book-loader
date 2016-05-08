module.exports = class BookPlugin {
  apply(compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      compilation.chunks = compilation.chunks.filter((chunk) => {
        // skip chunks without a book entry point
        if (!chunk.entryModule.loaders.find((s) => s.indexOf('book-loader/index.js') >= 0)) {
          return true;
        }

        const {files} = chunk;
        if (files.length !== 1) {
          return true;
        }

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

        const mainSource = compilation.assets[files[0]].source();
        const main = eval(mainSource);
        main.require.m.forEach((def, i) => {
          if (def) {
            const mod = main.require(i);
            if (mod.html && mod.url) {
              addAsset(mod);
            }
          }
        });

        delete compilation.assets[files[0]];

        return false;
      });

      callback();
    });
  }
};
