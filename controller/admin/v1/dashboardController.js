const { Op } = require('sequelize');
const moment = require('moment');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');


const getDashboard = async (req, res) => {
  try {
    const body = req.body || {};
    const dataQuery = body.query || {};
    let options = body.options || {};

    let { fromDay, toDay } = dataQuery;

    const todayIST = moment().tz ? moment().tz('Asia/Kolkata') : moment();
    const todayStr = todayIST.format('YYYY-MM-DD');

    if (!fromDay && !toDay) {
      fromDay = todayStr;
      toDay = todayStr;
    } else {
      if (!fromDay && toDay) fromDay = toDay;
      if (!toDay && fromDay) toDay = fromDay;
    }

    const startDate = moment(fromDay, 'YYYY-MM-DD').startOf('day').toDate();
    const endDate = moment(toDay, 'YYYY-MM-DD').endOf('day').toDate();

    const dateWhere = {
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    };

    // Optional company scope (if admin is tied to a company)
    const companyFilter =
      req.user && req.user.companyId
        ? { companyId: req.user.companyId }
        : {};

    // --- Helper to normalize options.sort into Sequelize order array ---
    const buildOrder = (opt) => {
      if (opt && opt.sort) {
        const sortEntries = Object.entries(opt.sort);
        return sortEntries.map(([field, direction]) => [
          field,
          direction === -1 ? 'DESC' : 'ASC'
        ]);
      }
      return [['createdAt', 'DESC']];
    };

    options = {
      ...options,
      order: buildOrder(options)
    };

    const walletWhere = {
      ...dateWhere,
      refId: 1,
      companyId: 1
    };

    const walletSuccessWhere = {
      ...walletWhere,
      paymentStatus: 'SUCCESS'
    };

    // --- AEPS1 (ASL) stats from aepsHistory ---
    const aeps1SuccessWhere = {
      ...dateWhere,
      ...companyFilter,
      status: 'SUCCESS'
    };

    // --- AEPS2 (Practomind) stats from practomindAepsHistory ---
    const practomindSuccessWhere = {
      ...dateWhere,
      ...companyFilter,
      // Treat truthy status / successful transactionStatus as success; filter basic status=true here
      status: true
    };

    // --- BBPS stats from billPaymentHistory ---
    const bbpsSuccessWhere = {
      ...dateWhere,
      ...companyFilter,
      transactionType: 'BBPS',
      paymentStatus: 'Success'
    };

    // --- Inspay (Mobile/DTH/PAN) stats from serviceTransaction ---
    const inspayMobileWhere = {
      ...dateWhere,
      ...companyFilter,
      serviceType: 'MobileRecharge',
      status: 'SUCCESS'
    };

    const inspayDthWhere = {
      ...dateWhere,
      ...companyFilter,
      serviceType: 'DTHRecharge',
      status: 'SUCCESS'
    };

    const inspayPanWhere = {
      ...dateWhere,
      ...companyFilter,
      serviceType: 'Pan',
      status: 'SUCCESS'
    };

    // --- Execute all aggregates in parallel for performance ---
    const [
      // Global walletHistory
      walletTotalSuperadminComm,
      walletTotalSuccessAmount,
      // AEPS1 (ASL)
      aeps1TotalAmount,
      aeps1TotalSuperadminComm,
      aeps1SuccessCount,
      // AEPS2 (Practomind)
      practomindTotalAmount,
      practomindSuccessCount,
      // BBPS
      bbpsTotalAmount,
      bbpsTotalSuperadminComm,
      bbpsSuccessCount,
      // Inspay Mobile
      inspayMobileTotalAmount,
      inspayMobileTotalSuperadminComm,
      inspayMobileSuccessCount,
      // Inspay DTH
      inspayDthTotalAmount,
      inspayDthTotalSuperadminComm,
      inspayDthSuccessCount,
      // Inspay PAN
      inspayPanTotalAmount,
      inspayPanTotalSuperadminComm,
      inspayPanSuccessCount,
      // Optional: paginated walletHistory for the given range
      walletPaginated
    ] = await Promise.all([
      // walletHistory aggregates (commission based on credited amount)
      model.walletHistory.sum('credit', { where: walletWhere }),
      model.walletHistory.sum('amount', { where: walletSuccessWhere }),

      // AEPS1 (ASL) from aepsHistory
      model.aepsHistory.sum('amount', { where: aeps1SuccessWhere }),
      model.aepsHistory.sum('superadminComm', { where: aeps1SuccessWhere }),
      model.aepsHistory.count({ where: aeps1SuccessWhere }),

      // AEPS2 (Practomind) from practomindAepsHistory
      model.practomindAepsHistory.sum('transactionAmount', {
        where: {
          ...practomindSuccessWhere,
          transactionType: 'CW'
        }
      }),
      model.practomindAepsHistory.count({
        where: {
          ...practomindSuccessWhere,
          transactionType: 'CW'
        }
      }),

      // BBPS
      model.billPaymentHistory.sum('amount', { where: bbpsSuccessWhere }),
      model.billPaymentHistory.sum('superadminComm', {
        where: bbpsSuccessWhere
      }),
      model.billPaymentHistory.count({ where: bbpsSuccessWhere }),

      // Inspay Mobile
      model.serviceTransaction.sum('amount', { where: inspayMobileWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayMobileWhere
      }),
      model.serviceTransaction.count({ where: inspayMobileWhere }),

      // Inspay DTH
      model.serviceTransaction.sum('amount', { where: inspayDthWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayDthWhere
      }),
      model.serviceTransaction.count({ where: inspayDthWhere }),

      // Inspay PAN
      model.serviceTransaction.sum('amount', { where: inspayPanWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayPanWhere
      }),
      model.serviceTransaction.count({ where: inspayPanWhere }),

      // Paginated walletHistory list scoped by date (initially filtered by today's date)
      dbService.paginate(
        model.walletHistory,
        walletWhere,
        options || { page: 1, paginate: 10, order: [['createdAt', 'DESC']] }
      )
    ]);

    return res.success({
      message: 'Dashboard statistics fetched successfully',
      data: {
        filters: {
          fromDay,
          toDay
        },
        wallet: {
          totalSuperadminCommission: Number(walletTotalSuperadminComm || 0),
          totalSuccessAmount: Number(walletTotalSuccessAmount || 0),
          list: walletPaginated || null
        },
        modules: {
          // AEPS1 -> ASL
          aeps1: {
            label: 'AEPS1 (ASL)',
            totalAmountSuccess: Number(aeps1TotalAmount || 0),
            totalSuperadminCommission: Number(aeps1TotalSuperadminComm || 0),
            successCount: aeps1SuccessCount || 0
          },
          // AEPS2 -> Practomind
          aeps2: {
            label: 'AEPS2 (Practomind)',
            totalAmountSuccess: Number(practomindTotalAmount || 0),
            successCount: practomindSuccessCount || 0
          },
          // BBPS
          bbps: {
            label: 'BBPS',
            totalAmountSuccess: Number(bbpsTotalAmount || 0),
            totalSuperadminCommission: Number(bbpsTotalSuperadminComm || 0),
            successCount: bbpsSuccessCount || 0
          },
          // Inspay grouped by service
          inspay: {
            mobile: {
              label: 'Inspay Mobile',
              totalAmountSuccess: Number(inspayMobileTotalAmount || 0),
              totalSuperadminCommission: Number(
                inspayMobileTotalSuperadminComm || 0
              ),
              successCount: inspayMobileSuccessCount || 0
            },
            dth: {
              label: 'Inspay DTH',
              totalAmountSuccess: Number(inspayDthTotalAmount || 0),
              totalSuperadminCommission: Number(
                inspayDthTotalSuperadminComm || 0
              ),
              successCount: inspayDthSuccessCount || 0
            },
            pan: {
              label: 'Inspay PAN',
              totalAmountSuccess: Number(inspayPanTotalAmount || 0),
              totalSuperadminCommission: Number(
                inspayPanTotalSuperadminComm || 0
              ),
              successCount: inspayPanSuccessCount || 0
            }
          }
        }
      }
    });
    } catch (error) {
        console.error('Error in getDashboard', error);
        return res.failure({ message: error.message });
    }
};

module.exports = {
    getDashboard
};