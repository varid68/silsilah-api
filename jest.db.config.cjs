module.exports = {
  ...require('./jest.config.cjs'),
  testRegex: 'test/.*\\.db-test\\.ts$',
  testTimeout: 60000,
};
