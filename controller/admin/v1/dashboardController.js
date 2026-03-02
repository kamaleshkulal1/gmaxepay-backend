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

    const fromMoment = moment(fromDay, 'YYYY-MM-DD');
    const toMoment = moment(toDay, 'YYYY-MM-DD');

    const startDate = fromMoment.startOf('day').toDate();
    const endDate = toMoment.endOf('day').toDate();

    const dateWhere = {
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    };

    // Previous period (same length) for day-back comparison
    const daysDiff = toMoment.diff(fromMoment, 'days') + 1;
    const prevFromMoment = fromMoment.clone().subtract(daysDiff, 'days');
    const prevToMoment = fromMoment.clone().subtract(1, 'days');
    const prevStartDate = prevFromMoment.startOf('day').toDate();
    const prevEndDate = prevToMoment.endOf('day').toDate();

    const prevDateWhere = {
      createdAt: {
        [Op.between]: [prevStartDate, prevEndDate]
      }
    };

    // Optional company scope (if admin is tied to a company)
    // const companyFilter =
    //   req.user && req.user.companyId
    //     ? { companyId: req.user.companyId }
    //     : {};

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
      //   ...companyFilter,
      status: 'SUCCESS'
    };

    // --- AEPS2 (Practomind) stats from practomindAepsHistory ---
    const practomindSuccessWhere = {
      ...dateWhere,
      //   ...companyFilter,
      // Treat truthy status / successful transactionStatus as success; filter basic status=true here
      status: true
    };

    // --- BBPS stats from billPaymentHistory ---
    const bbpsSuccessWhere = {
      ...dateWhere,
      transactionType: 'BBPS',
      paymentStatus: 'Success'
    };

    // --- Inspay (Mobile/DTH/PAN) stats from serviceTransaction ---
    const inspayMobileWhere = {
      ...dateWhere,
      serviceType: 'Mobile1Recharge',
      status: 'SUCCESS'
    };

    const inspayDthWhere = {
      ...dateWhere,
      serviceType: 'DTH1Recharge',
      status: 'SUCCESS'
    };

    const inspayPanWhere = {
      ...dateWhere,
      serviceType: 'Pan1',
      status: 'SUCCESS'
    };

    const inspayMobileVolumeWhere = {
      ...dateWhere,
      serviceType: 'Mobile1Recharge',
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    const inspayDthVolumeWhere = {
      ...dateWhere,
      serviceType: 'DTH1Recharge',
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    const inspayPanVolumeWhere = {
      ...dateWhere,
      serviceType: 'Pan1',
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    // --- A1 Top (Mobile2/DTH2/Pan2) stats from service1Transaction ---
    const a1topMobileWhere = { ...dateWhere, serviceType: 'Mobile2Recharge', status: 'SUCCESS' };
    const a1topDthWhere = { ...dateWhere, serviceType: 'DTH2Recharge', status: 'SUCCESS' };
    const a1topPanWhere = { ...dateWhere, serviceType: 'Pan2', status: 'SUCCESS' };
    const a1topMobileVolumeWhere = { ...dateWhere, serviceType: 'Mobile2Recharge', status: { [Op.in]: ['SUCCESS', 'PENDING'] } };
    const a1topDthVolumeWhere = { ...dateWhere, serviceType: 'DTH2Recharge', status: { [Op.in]: ['SUCCESS', 'PENDING'] } };
    const a1topPanVolumeWhere = { ...dateWhere, serviceType: 'Pan2', status: { [Op.in]: ['SUCCESS', 'PENDING'] } };

    const aeps1VolumeWhere = {
      ...dateWhere,
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    const aeps2VolumeWhere = {
      ...dateWhere,
      transactionType: 'CW',
      [Op.or]: [
        {
          status: true,
          transactionStatus: { [Op.iLike]: 'success%' }
        },
        {
          transactionStatus: { [Op.iLike]: 'pending%' }
        }
      ]
    };

    const bbpsVolumeWhere = {
      ...dateWhere,
      transactionType: 'BBPS',
      paymentStatus: { [Op.in]: ['Success', 'Pending'] }
    };

    const aeps1PayoutVolumeWhere = {
      ...dateWhere,
      walletType: 'apes1Wallet',
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    const aeps2PayoutVolumeWhere = {
      ...dateWhere,
      walletType: 'apes2Wallet',
      status: { [Op.in]: ['SUCCESS', 'PENDING'] }
    };

    const aeps1PayoutWhere = {
      ...dateWhere,
      walletType: 'apes1Wallet',
      status: 'SUCCESS'
    };

    const aeps2PayoutWhere = {
      ...dateWhere,
      walletType: 'apes2Wallet',
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
      // AEPS payouts (bank) from payoutHistory
      aeps1PayoutTotalAmount,
      aeps1PayoutSuccessCount,
      aeps2PayoutTotalAmount,
      aeps2PayoutSuccessCount,
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
      // A1 Top Mobile
      a1topMobileTotalAmount,
      a1topMobileTotalSuperadminComm,
      a1topMobileSuccessCount,
      // A1 Top DTH
      a1topDthTotalAmount,
      a1topDthTotalSuperadminComm,
      a1topDthSuccessCount,
      // A1 Top PAN
      a1topPanTotalAmount,
      a1topPanTotalSuperadminComm,
      a1topPanSuccessCount,
      // Previous period wallet totals (for comparison)
      prevWalletTotalSuperadminComm,
      prevWalletTotalSuccessAmount,
      // Global status counts (FAILED / PENDING)
      aeps1FailedCount,
      aeps1PendingCount,
      practomindFailedCount,
      practomindPendingCount,
      bbpsFailedCount,
      bbpsPendingCount,
      inspayFailedCount,
      inspayPendingCount,
      a1topFailedCount,
      a1topPendingCount,
      payoutFailedCount,
      payoutPendingCount
    ] = await Promise.all([
      // walletHistory aggregates (commission based on credited amount)
      model.walletHistory.sum('credit', { where: walletWhere }),
      model.walletHistory.sum('amount', { where: walletSuccessWhere }),

      model.aepsHistory.sum('amount', { where: aeps1VolumeWhere }),
      model.aepsHistory.sum('superadminComm', { where: aeps1SuccessWhere }),
      model.aepsHistory.count({ where: aeps1SuccessWhere }),

      model.practomindAepsHistory.sum('transactionAmount', {
        where: aeps2VolumeWhere
      }),
      model.practomindAepsHistory.count({
        where: {
          ...practomindSuccessWhere,
          transactionType: 'CW'
        }
      }),

      model.payoutHistory.sum('amount', { where: aeps1PayoutVolumeWhere }),
      model.payoutHistory.count({ where: aeps1PayoutWhere }),

      model.payoutHistory.sum('amount', { where: aeps2PayoutVolumeWhere }),
      model.payoutHistory.count({ where: aeps2PayoutWhere }),

      model.billPaymentHistory.sum('amount', { where: bbpsVolumeWhere }),
      model.billPaymentHistory.sum('superadminComm', {
        where: bbpsSuccessWhere
      }),
      model.billPaymentHistory.count({ where: bbpsSuccessWhere }),

      model.serviceTransaction.sum('amount', { where: inspayMobileVolumeWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayMobileWhere
      }),
      model.serviceTransaction.count({ where: inspayMobileWhere }),

      model.serviceTransaction.sum('amount', { where: inspayDthVolumeWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayDthWhere
      }),
      model.serviceTransaction.count({ where: inspayDthWhere }),

      model.serviceTransaction.sum('amount', { where: inspayPanVolumeWhere }),
      model.serviceTransaction.sum('superadminComm', {
        where: inspayPanWhere
      }),
      model.serviceTransaction.count({ where: inspayPanWhere }),

      // A1 Top Mobile
      model.service1Transaction.sum('amount', { where: a1topMobileVolumeWhere }),
      model.service1Transaction.sum('superadminComm', { where: a1topMobileWhere }),
      model.service1Transaction.count({ where: a1topMobileWhere }),
      // A1 Top DTH
      model.service1Transaction.sum('amount', { where: a1topDthVolumeWhere }),
      model.service1Transaction.sum('superadminComm', { where: a1topDthWhere }),
      model.service1Transaction.count({ where: a1topDthWhere }),
      // A1 Top PAN
      model.service1Transaction.sum('amount', { where: a1topPanVolumeWhere }),
      model.service1Transaction.sum('superadminComm', { where: a1topPanWhere }),
      model.service1Transaction.count({ where: a1topPanWhere }),

      // Previous period wallet aggregates
      model.walletHistory.sum('credit', {
        where: {
          ...walletWhere,
          createdAt: prevDateWhere.createdAt
        }
      }),
      model.walletHistory.sum('amount', {
        where: {
          ...walletSuccessWhere,
          createdAt: prevDateWhere.createdAt
        }
      }),

      model.aepsHistory.count({
        where: { ...dateWhere, status: 'FAILED' }
      }),
      model.aepsHistory.count({
        where: { ...dateWhere, status: 'PENDING' }
      }),

      // AEPS2 (Practomind) failures & pendings from practomindAepsHistory
      model.practomindAepsHistory.count({
        where: {
          ...dateWhere,
          transactionStatus: { [Op.iLike]: 'failed%' }
        }
      }),
      model.practomindAepsHistory.count({
        where: {
          ...dateWhere,
          transactionStatus: { [Op.iLike]: 'pending%' }
        }
      }),

      // BBPS failures & pendings from billPaymentHistory
      model.billPaymentHistory.count({
        where: { ...dateWhere, paymentStatus: 'Failed' }
      }),
      model.billPaymentHistory.count({
        where: { ...dateWhere, paymentStatus: 'Pending' }
      }),

      // Inspay (Mobile/DTH/PAN) failures & pendings from serviceTransaction
      model.serviceTransaction.count({
        where: { ...dateWhere, status: 'FAILURE' }
      }),
      model.serviceTransaction.count({
        where: { ...dateWhere, status: 'PENDING' }
      }),

      // A1 Top failures & pendings from service1Transaction
      model.service1Transaction.count({
        where: { ...dateWhere, status: 'FAILURE' }
      }),
      model.service1Transaction.count({
        where: { ...dateWhere, status: 'PENDING' }
      }),

      // Payout failures & pendings from payoutHistory
      model.payoutHistory.count({
        where: { ...dateWhere, status: 'FAILED' }
      }),
      model.payoutHistory.count({
        where: { ...dateWhere, status: 'PENDING' }
      })
    ]);

    // Aggregate overall status counts
    const totalSuccessCount =
      (aeps1SuccessCount || 0) +
      (practomindSuccessCount || 0) +
      (aeps1PayoutSuccessCount || 0) +
      (aeps2PayoutSuccessCount || 0) +
      (bbpsSuccessCount || 0) +
      (inspayMobileSuccessCount || 0) +
      (inspayDthSuccessCount || 0) +
      (inspayPanSuccessCount || 0) +
      (a1topMobileSuccessCount || 0) +
      (a1topDthSuccessCount || 0) +
      (a1topPanSuccessCount || 0);

    const totalFailedCount =
      (aeps1FailedCount || 0) +
      (practomindFailedCount || 0) +
      (bbpsFailedCount || 0) +
      (inspayFailedCount || 0) +
      (a1topFailedCount || 0) +
      (payoutFailedCount || 0);

    const totalPendingCount =
      (aeps1PendingCount || 0) +
      (practomindPendingCount || 0) +
      (bbpsPendingCount || 0) +
      (inspayPendingCount || 0) +
      (a1topPendingCount || 0) +
      (payoutPendingCount || 0);

    const currentWalletAmount = Number(walletTotalSuccessAmount || 0);
    const previousWalletAmount = Number(prevWalletTotalSuccessAmount || 0);
    const walletChangeAmount = currentWalletAmount - previousWalletAmount;
    const walletChangePercent =
      previousWalletAmount > 0
        ? Math.round(((walletChangeAmount / previousWalletAmount) * 100 + Number.EPSILON) * 100) /
        100
        : null;

    return res.success({
      message: 'Dashboard statistics fetched successfully',
      data: {
        filters: {
          fromDay,
          toDay
        },
        wallet: {
          totalSuperadminCommission: Number(walletTotalSuperadminComm || 0),
          totalSuccessAmount: currentWalletAmount,
          previousTotalSuccessAmount: previousWalletAmount,
          changeAmount: walletChangeAmount,
          changePercent: walletChangePercent
        },
        statusSummary: {
          totalSuccessCount,
          totalFailedCount,
          totalPendingCount
        },
        modules: {
          // ASL (AEPS1) - CW + Payouts
          asl: {
            label: 'ASL',
            totalAmountSuccess:
              Number(aeps1TotalAmount || 0) +
              Number(aeps1PayoutTotalAmount || 0),
            totalSuperadminCommission: Number(aeps1TotalSuperadminComm || 0),
            successCount: (aeps1SuccessCount || 0) + (aeps1PayoutSuccessCount || 0)
          },
          // Practomind (AEPS2) - CW + Payouts
          practomind: {
            label: 'Practomind',
            totalAmountSuccess:
              Number(practomindTotalAmount || 0) +
              Number(aeps2PayoutTotalAmount || 0),
            // No explicit superadminComm field persisted for practomind; keep 0 for now
            totalSuperadminCommission: 0,
            successCount:
              (practomindSuccessCount || 0) + (aeps2PayoutSuccessCount || 0)
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
            // Combined Inspay (Mobile + DTH + PAN)
            total: {
              label: 'Inspay',
              totalAmountSuccess:
                Number(inspayMobileTotalAmount || 0) +
                Number(inspayDthTotalAmount || 0) +
                Number(inspayPanTotalAmount || 0),
              totalSuperadminCommission:
                Number(inspayMobileTotalSuperadminComm || 0) +
                Number(inspayDthTotalSuperadminComm || 0) +
                Number(inspayPanTotalSuperadminComm || 0),
              successCount:
                (inspayMobileSuccessCount || 0) +
                (inspayDthSuccessCount || 0) +
                (inspayPanSuccessCount || 0)
            },
            mobile: {
              label: 'Inspay Mobile Recharge',
              totalAmountSuccess: Number(inspayMobileTotalAmount || 0),
              totalSuperadminCommission: Number(
                inspayMobileTotalSuperadminComm || 0
              ),
              successCount: inspayMobileSuccessCount || 0
            },
            dth: {
              label: 'Inspay DTH Recharge',
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
          },
          // A1 Top grouped by service
          a1top: {
            total: {
              label: 'A1 Top',
              totalAmountSuccess:
                Number(a1topMobileTotalAmount || 0) +
                Number(a1topDthTotalAmount || 0) +
                Number(a1topPanTotalAmount || 0),
              totalSuperadminCommission:
                Number(a1topMobileTotalSuperadminComm || 0) +
                Number(a1topDthTotalSuperadminComm || 0) +
                Number(a1topPanTotalSuperadminComm || 0),
              successCount:
                (a1topMobileSuccessCount || 0) +
                (a1topDthSuccessCount || 0) +
                (a1topPanSuccessCount || 0)
            },
            mobile: {
              label: 'A1 Top Mobile Recharge',
              totalAmountSuccess: Number(a1topMobileTotalAmount || 0),
              totalSuperadminCommission: Number(a1topMobileTotalSuperadminComm || 0),
              successCount: a1topMobileSuccessCount || 0
            },
            dth: {
              label: 'A1 Top DTH Recharge',
              totalAmountSuccess: Number(a1topDthTotalAmount || 0),
              totalSuperadminCommission: Number(a1topDthTotalSuperadminComm || 0),
              successCount: a1topDthSuccessCount || 0
            },
            pan: {
              label: 'A1 Top PAN',
              totalAmountSuccess: Number(a1topPanTotalAmount || 0),
              totalSuperadminCommission: Number(a1topPanTotalSuperadminComm || 0),
              successCount: a1topPanSuccessCount || 0
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
