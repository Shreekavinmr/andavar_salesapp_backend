const DealerViewService = require('../services/dealerViewService');
const { sendResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class DealerViewController {
  // DealerViewController.getDealersList
static async getDealersList(req, res) {
  try {
    const userId = req.user.id;
    const options = {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      search: req.query.q || req.query.search,
    };

    // DEBUG: log incoming request / options
    logger.info(`getDealersList called by user=${userId}`, { options });

    const result = await DealerViewService.getDealersList(userId, options);

    // DEBUG: log a small sample of result before sending
    logger.info(`getDealersList result for user=${userId} count=${result.total || result.count || 0}`);
    if (Array.isArray(result.dealers) && result.dealers.length > 0) {
      // log first dealer only to avoid huge logs
      logger.debug('getDealersList sample dealer', { sample: result.dealers[0] });
    }

    sendResponse(res, 200, 'Dealers fetched successfully', result);
  } catch (error) {
    logger.error(`DealerViewController.getDealersList error: ${error.message}`, { stack: error.stack });
    sendResponse(res, 400, error.message);
  }
}

}

module.exports = DealerViewController;