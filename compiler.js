// https://github.com/webpack/extract-text-webpack-plugin/blob/a5996652713ce9804575993b45cbae8dbbdfcf1a/loader.js
// https://github.com/ampedandwired/html-webpack-plugin/blob/10058066d74ffc9ddf316020d335ca06303b2540/lib/compiler.js
// https://github.com/webpack/worker-loader/blob/4d029f9b89a5555dd00663a58f08d79424855653/index.js
// https://github.com/webpack/webpack/issues/1429

const loaderUtils = require("loader-utils");
const NodeTemplatePlugin = require("webpack/lib/node/NodeTemplatePlugin");
const NodeTargetPlugin = require("webpack/lib/node/NodeTargetPlugin");
const LibraryTemplatePlugin = require("webpack/lib/LibraryTemplatePlugin");
const SingleEntryPlugin = require("webpack/lib/SingleEntryPlugin");
const LimitChunkCountPlugin = require("webpack/lib/optimize/LimitChunkCountPlugin");

module.exports = function compile(loaderContext, request) {
  const filename = "whaaaaat-output-filename";
  const publicPath = loaderContext._compilation.outputOptions.publicPath;
  const outputOptions = {filename, publicPath};

  const childCompiler = loaderContext._compilation.createChildCompiler("book/run", outputOptions);

  childCompiler.apply(new NodeTemplatePlugin(outputOptions));
	childCompiler.apply(new LibraryTemplatePlugin(null, "commonjs2"));
	childCompiler.apply(new NodeTargetPlugin());
	childCompiler.apply(new SingleEntryPlugin(loaderContext.context, "!!" + request));
	childCompiler.apply(new LimitChunkCountPlugin({ maxChunks: 1 }));
	const subCache = "subcache " + __dirname + " " + request;
	childCompiler.plugin("compilation", function(compilation) {
		if (compilation.cache) {
			if (!compilation.cache[subCache])
				compilation.cache[subCache] = {};
			compilation.cache = compilation.cache[subCache];
		}
	});

  let source;
  childCompiler.plugin('after-compile', (compilation, callback) => {
    console.log(`after-compile ${request}`, !!compilation.assets[filename]);
    if (!compilation.assets[filename]) {
      console.log(compilation.assets);
    }
    source = compilation.assets[filename] && compilation.assets[filename].source();

    // Remove all chunk assets
    compilation.chunks.forEach(function(chunk) {
      chunk.files.forEach(function(file) {
        delete compilation.assets[file];
      });
    });

    callback();
  });

  return new Promise((resolve, reject) => {
    childCompiler.runAsChild((err, entries, compilation) => {
      let resultSource;
  		if(err) return reject(err);

  		if (compilation.errors.length > 0) {
  			return reject(compilation.errors[0]);
  		}
  		compilation.fileDependencies.forEach((dep) => {
  			loaderContext.addDependency(dep);
  		});
  		compilation.contextDependencies.forEach((dep) => {
  			loaderContext.addContextDependency(dep);
  		});
  		if (!source) {
        source = `module.exports = '# SOMETHING IS VERY WRONG\\n\\nDidn\\'t get a result from child compiler'`;
  			//return reject(new Error("Didn't get a result from child compiler"));
  		}

  		try {
        console.log(`${request} exec source`);
  			let text = loaderContext.exec(source, request);
  			if(typeof text === "string")
  				text = [[0, text]];
  			text.forEach((item) => {
  				var id = item[0];
  				compilation.modules.forEach((module) => {
  					if(module.id === id)
  						item[0] = module.identifier();
  				});
  			});
  			//this[__dirname](text, query);
  			if(text.locals && typeof resultSource !== "undefined") {
  				resultSource += "\nmodule.exports = " + JSON.stringify(text.locals) + ";";
  			}
  		} catch(e) {
  			return reject(e);
  		}
  		if(resultSource)
  			resolve(resultSource);
  		else
  			resolve();
  	});
  });
}
