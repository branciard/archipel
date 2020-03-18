const express = require('express');
const bodyParser = require('body-parser');
const mainRoutes = require('./routes/main');
const metricsRoutes = require('./routes/metrics');
const orchestratorRoutes = require('./routes/orchestrator');

// Return not found response
const get404 = (req, res, next) => {
  const error = {
    errors: [
      {
        status: '404',
        title: 'Not found',
        detail: 'Requested resource was not found.'
      }
    ]
  };
  res.status(404).json(error);
};

// Simple error handler
const errorHandler = (err, req, res, next) => {
  const error = {
    errors: [
      {
        status: '500',
        title: 'Error',
        detail: err.toString()
      }
    ]
  };
  res.status(500).json(error);
};

// Init api
const initApi = async orchestrator => {
  const app = express();

  app.set('orchestrator', orchestrator);

  // Add body parser to express
  app.use(bodyParser.urlencoded({ extended: false }));

  // Use routes
  app.use('/', mainRoutes.routes);
  app.use('/metrics', metricsRoutes.routes);
  app.use('/orchestration', orchestratorRoutes.routes);

  // Add not found middleware
  app.use(get404);

  // Add error handler
  app.use(errorHandler);

  // Set listen port
  app.listen(3000);
};

module.exports = {
  initApi
};
