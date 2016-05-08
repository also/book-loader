const lunr = require('lunr');

exports.loadIndex = function loadIndex(path=`${__webpack_public_path__}search-index.json`) {
  var req = new XMLHttpRequest();

  req.open('GET', path);
  req.send();

  return new Promise((resolve, reject) => {
    req.addEventListener('load', () => {
      const data = JSON.parse(req.responseText);
      const index = lunr.Index.load(data.index);
      const result = {docs: data.docs, index};
      result.search = exports.search.bind(null, result);
      resolve(result);
    });
    req.addEventListener('error', () => reject(new Error(`Failed loading ${path}`)));
  });
}

exports.search = function search({docs, index}, query) {
  return index.search(query).map((result) => {
    return docs[result.ref];
  })
}
