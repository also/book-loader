const compiler = require('./compiler');

module.exports = function(content) {
  this.cacheable();
  return content;
}

module.exports.pitch = function compilePage(request) {
  this.cacheable();
  this.addDependency(this.resourcePath);
  const callback = this.async();

  compiler(this, request).then(
    (result) => {
      console.log('compiled');
      console.log(result);

      callback(null, '/* POOF */')
    },
    callback
  )
}
