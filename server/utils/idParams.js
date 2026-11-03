// Route parameters like :id must be whole numbers. Checking them once, up front,
// turns a junk address such as /api/medicines/abc into a clear 400 instead of
// a confusing "not found" or a database error.
function numericIdParams(router, ...names) {
  for (const name of names) {
    router.param(name, (req, res, next, value) => {
      if (/^\d{1,10}$/.test(value)) return next();
      return res.status(400).json({ error: `Invalid ${name === 'id' ? 'id' : name.replace(/Id$/, ' id')}: "${String(value).slice(0, 30)}" is not a number` });
    });
  }
}

module.exports = { numericIdParams };
