const cheerio = require('cheerio');

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

        function addAsset(mod) {
          let {url, html, attributes={}, template} = mod;

          // attributes is optional to return, but required for templates
          mod = Object.assign({}, mod, {attributes});

          try {
            html = html(mod);
          } catch (e) {
            e.file = url;
            compilation.errors.push(e);
            html = `build error`;
          }

          const $ = cheerio.load(html);

          let {title} = attributes;
          if (!title) {
            const titleElt = $('h1, h2');
            if (titleElt.length === 0) {
              const e = new Error(`No h1 or h2 or title attribute`);
              e.file = url;
              compilation.warnings.push(e);
            } else {
              title = titleElt.first().text();
            }
          }

          if (template) {
            html = template.html(Object.assign({}, mod, {title, html: () => html}));
          }

          compilation.assets[url] = {
            source: () => html,
            size: () => html.length,
            $,
            title
          };
        }

        const mainSource = compilation.assets[files[0]].source();
        const main = eval(mainSource);
        main.require.m.forEach((def, i) => {
          if (def) {
            const mod = main.require(i);
            if (mod.html && mod.url && !mod.isTemplate) {
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
