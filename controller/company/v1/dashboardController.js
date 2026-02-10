const { Op } = require('sequelize');
const moment = require('moment');
const dbService = require('../../../utils/dbService');
const model = require('../../../models');

const roundToTwo = (num) => {
  if (num === null || num === undefined) return 0;
  const n = Number(num);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const getDashboard = async (req, res) => {
    try {
        const companyId = req.user.companyId;
    
    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    const body = req.body || {};
    const dataQuery = body.query || {};
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
      companyId,
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    };

    const todayStart = moment(todayStr, 'YYYY-MM-DD').startOf('day').toDate();
    const todayEnd = moment(todayStr, 'YYYY-MM-DD').endOf('day').toDate();
    const todayWhere = {
      companyId,
      createdAt: {
        [Op.between]: [todayStart, todayEnd]
      }
    };

    const companyFilter = { companyId };

    const [
      totalMasterDistributorCount,
      totalDistributorCount,
      totalRetailerCount,
      todayMasterDistributorCount,
      todayDistributorCount,
      todayRetailerCount
    ] = await Promise.all([
      model.user.count({
        where: { ...companyFilter, userRole: 3, isDeleted: false }
      }),
      model.user.count({
        where: { ...companyFilter, userRole: 4, isDeleted: false }
      }),
      model.user.count({
        where: { ...companyFilter, userRole: 5, isDeleted: false }
      }),
      model.user.count({
        where: { ...todayWhere, userRole: 3, isDeleted: false }
      }),
      model.user.count({
        where: { ...todayWhere, userRole: 4, isDeleted: false }
      }),
      model.user.count({
        where: { ...todayWhere, userRole: 5, isDeleted: false }
      })
    ]);

    const nsdlPanWhere = {
      ...dateWhere,
      serviceType: 'Pan'
    };

    const aeps1Where = {
      ...dateWhere
    };

    const aeps2Where = {
      ...dateWhere
    };

    const mobileWhere = {
      ...dateWhere,
      serviceType: 'MobileRecharge'
    };

    const dthWhere = {
      ...dateWhere,
      serviceType: 'DTHRecharge'
    };

    const bbpsWhere = {
      ...dateWhere
    };

    const payoutWhere = {
      ...dateWhere
    };

    const [
      nsdlPanTotalVolume,
      nsdlPanTotalCount,
      nsdlPanSuccessCount,
      nsdlPanPendingCount,
      nsdlPanFailedCount,
      aeps1TotalVolume,
      aeps1TotalCount,
      aeps1SuccessCount,
      aeps1PendingCount,
      aeps1FailedCount,
      aeps2TotalVolume,
      aeps2TotalCount,
      aeps2SuccessCount,
      aeps2PendingCount,
      aeps2FailedCount,
      mobileTotalVolume,
      mobileTotalCount,
      mobileSuccessCount,
      mobilePendingCount,
      mobileFailedCount,
      dthTotalVolume,
      dthTotalCount,
      dthSuccessCount,
      dthPendingCount,
      dthFailedCount,
      bbpsTotalVolume,
      bbpsTotalCount,
      bbpsSuccessCount,
      bbpsPendingCount,
      bbpsFailedCount,
      bbpsCompanyCommission,
      bbpsWhitelabelComm,
      payoutTotalVolume,
      payoutTotalCount,
      payoutSuccessCount,
      payoutPendingCount,
      payoutFailedCount,
      walletCommission,
      walletWhitelabelCommission,
      serviceTransactionWhitelabelComm,
      aeps1WhitelabelComm
    ] = await Promise.all([
      model.serviceTransaction.sum('amount', { where: nsdlPanWhere }),
      model.serviceTransaction.count({ where: nsdlPanWhere }),
      model.serviceTransaction.count({
        where: { ...nsdlPanWhere, status: 'SUCCESS' }
      }),
      model.serviceTransaction.count({
        where: { ...nsdlPanWhere, status: 'PENDING' }
      }),
      model.serviceTransaction.count({
        where: { ...nsdlPanWhere, status: 'FAILURE' }
      }),
      model.aepsHistory.sum('amount', { where: aeps1Where }),
      model.aepsHistory.count({ where: aeps1Where }),
      model.aepsHistory.count({
        where: { ...aeps1Where, status: 'SUCCESS' }
      }),
      model.aepsHistory.count({
        where: { ...aeps1Where, status: 'PENDING' }
      }),
      model.aepsHistory.count({
        where: { ...aeps1Where, status: 'FAILED' }
      }),
      model.practomindAepsHistory.sum('transactionAmount', {
        where: { ...aeps2Where, transactionType: 'CW' }
      }),
      model.practomindAepsHistory.count({ where: aeps2Where }),
      model.practomindAepsHistory.count({
        where: {
          ...aeps2Where,
          status: true,
          transactionStatus: { [Op.iLike]: 'success%' }
        }
      }),
      model.practomindAepsHistory.count({
        where: {
          ...aeps2Where,
          transactionStatus: { [Op.iLike]: 'pending%' }
        }
      }),
      model.practomindAepsHistory.count({
        where: {
          ...aeps2Where,
          transactionStatus: { [Op.iLike]: 'failed%' }
        }
      }),
      model.serviceTransaction.sum('amount', { where: mobileWhere }),
      model.serviceTransaction.count({ where: mobileWhere }),
      model.serviceTransaction.count({
        where: { ...mobileWhere, status: 'SUCCESS' }
      }),
      model.serviceTransaction.count({
        where: { ...mobileWhere, status: 'PENDING' }
      }),
      model.serviceTransaction.count({
        where: { ...mobileWhere, status: 'FAILURE' }
      }),
      model.serviceTransaction.sum('amount', { where: dthWhere }),
      model.serviceTransaction.count({ where: dthWhere }),
      model.serviceTransaction.count({
        where: { ...dthWhere, status: 'SUCCESS' }
      }),
      model.serviceTransaction.count({
        where: { ...dthWhere, status: 'PENDING' }
      }),
      model.serviceTransaction.count({
        where: { ...dthWhere, status: 'FAILURE' }
      }),
      model.billPaymentHistory.sum('amount', { where: bbpsWhere }),
      model.billPaymentHistory.count({ where: bbpsWhere }),
      model.billPaymentHistory.count({
        where: { ...bbpsWhere, paymentStatus: 'Success' }
      }),
      model.billPaymentHistory.count({
        where: { ...bbpsWhere, paymentStatus: 'Pending' }
      }),
      model.billPaymentHistory.count({
        where: { ...bbpsWhere, paymentStatus: 'Failed' }
      }),
      model.billPaymentHistory.sum('companyCommission', {
        where: { ...bbpsWhere, paymentStatus: 'Success' }
      }),
      model.billPaymentHistory.sum('whitelabelComm', {
        where: { ...bbpsWhere, paymentStatus: 'Success' }
      }),
      model.payoutHistory.sum('amount', { where: payoutWhere }),
      model.payoutHistory.count({ where: payoutWhere }),
      model.payoutHistory.count({
        where: { ...payoutWhere, status: 'SUCCESS' }
      }),
      model.payoutHistory.count({
        where: { ...payoutWhere, status: 'PENDING' }
      }),
      model.payoutHistory.count({
        where: { ...payoutWhere, status: 'FAILED' }
      }),
      model.walletHistory.sum('credit', {
        where: {
          ...dateWhere,
          paymentStatus: 'SUCCESS'
        }
      }),
      model.walletHistory.sum('whitelabelCommission', {
        where: {
          ...dateWhere,
          paymentStatus: 'SUCCESS'
        }
      }),
      model.serviceTransaction.sum('whitelabelComm', {
        where: {
          ...dateWhere,
          status: 'SUCCESS'
        }
      }),
      model.aepsHistory.sum('whitelabelComm', {
        where: {
          ...aeps1Where,
          status: 'SUCCESS'
        }
      })
    ]);

    const companyCommission = roundToTwo(bbpsCompanyCommission || 0);
    const whitelabelCommission = roundToTwo(
      (bbpsWhitelabelComm || 0) +
      (walletWhitelabelCommission || 0) +
      (serviceTransactionWhitelabelComm || 0) +
      (aeps1WhitelabelComm || 0)
    );
    const walletCommissionValue = roundToTwo(walletCommission || 0);
    const totalCommission = roundToTwo(
      companyCommission +
      whitelabelCommission +
      walletCommissionValue
    );

    return res.success({
      message: 'Dashboard statistics fetched successfully',
      data: {
        filters: {
          fromDay,
          toDay,
          companyId
        },
        userStats: {
          total: {
            masterDistributor: totalMasterDistributorCount || 0,
            distributor: totalDistributorCount || 0,
            retailer: totalRetailerCount || 0
          },
          todayCreated: {
            masterDistributor: todayMasterDistributorCount || 0,
            distributor: todayDistributorCount || 0,
            retailer: todayRetailerCount || 0
          }
        },
        commissions: {
          companyCommission,
          whitelabelCommission,
          walletCommission: walletCommissionValue,
          totalCommission
        },
        services: {
          nsdlPan: {
            label: 'NSDL Pan',
            totalVolume: roundToTwo(nsdlPanTotalVolume || 0),
            totalCount: nsdlPanTotalCount || 0,
            successCount: nsdlPanSuccessCount || 0,
            pendingCount: nsdlPanPendingCount || 0,
            failedCount: nsdlPanFailedCount || 0
          },
          aeps1: {
            label: 'AEPS 1',
            totalVolume: roundToTwo(aeps1TotalVolume || 0),
            totalCount: aeps1TotalCount || 0,
            successCount: aeps1SuccessCount || 0,
            pendingCount: aeps1PendingCount || 0,
            failedCount: aeps1FailedCount || 0
          },
          aeps2: {
            label: 'AEPS 2',
            totalVolume: roundToTwo(aeps2TotalVolume || 0),
            totalCount: aeps2TotalCount || 0,
            successCount: aeps2SuccessCount || 0,
            pendingCount: aeps2PendingCount || 0,
            failedCount: aeps2FailedCount || 0
          },
          mobile: {
            label: 'Mobile',
            totalVolume: roundToTwo(mobileTotalVolume || 0),
            totalCount: mobileTotalCount || 0,
            successCount: mobileSuccessCount || 0,
            pendingCount: mobilePendingCount || 0,
            failedCount: mobileFailedCount || 0
          },
          dth: {
            label: 'DTH',
            totalVolume: roundToTwo(dthTotalVolume || 0),
            totalCount: dthTotalCount || 0,
            successCount: dthSuccessCount || 0,
            pendingCount: dthPendingCount || 0,
            failedCount: dthFailedCount || 0
          },
          bbps: {
            label: 'BBPS',
            totalVolume: roundToTwo(bbpsTotalVolume || 0),
            totalCount: bbpsTotalCount || 0,
            successCount: bbpsSuccessCount || 0,
            pendingCount: bbpsPendingCount || 0,
            failedCount: bbpsFailedCount || 0
          },
          payout: {
            label: 'Payout',
            totalVolume: roundToTwo(payoutTotalVolume || 0),
            totalCount: payoutTotalCount || 0,
            successCount: payoutSuccessCount || 0,
            pendingCount: payoutPendingCount || 0,
            failedCount: payoutFailedCount || 0
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
