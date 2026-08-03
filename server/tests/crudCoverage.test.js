const test = require('node:test');
const assert = require('node:assert/strict');

const medicineController = require('../controllers/medicineController');
const supplierController = require('../controllers/supplierController');
const batchController = require('../controllers/batchController');
const userController = require('../controllers/userController');

const medicineRoutes = require('../routes/medicineRoutes');
const supplierRoutes = require('../routes/supplierRoutes');
const batchRoutes = require('../routes/batchRoutes');
const userRoutes = require('../routes/userRoutes');

function collectRoutes(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((method) => layer.route.methods[method])
    }));
}

test('inventory controllers expose full delete support', () => {
  assert.equal(typeof medicineController.remove, 'function');
  assert.equal(typeof supplierController.remove, 'function');
  assert.equal(typeof batchController.remove, 'function');
  assert.equal(typeof userController.remove, 'function');
});

test('CRUD routes are registered for inventory and user management', () => {
  const medicineRouteMethods = collectRoutes(medicineRoutes);
  const supplierRouteMethods = collectRoutes(supplierRoutes);
  const batchRouteMethods = collectRoutes(batchRoutes);
  const userRouteMethods = collectRoutes(userRoutes);

  assert.ok(medicineRouteMethods.some((route) => route.methods.includes('delete') && route.path === '/:id'));
  assert.ok(supplierRouteMethods.some((route) => route.methods.includes('delete') && route.path === '/:id'));
  assert.ok(batchRouteMethods.some((route) => route.methods.includes('delete') && route.path === '/:id'));
  assert.ok(userRouteMethods.some((route) => route.methods.includes('delete') && route.path === '/:id'));
});
