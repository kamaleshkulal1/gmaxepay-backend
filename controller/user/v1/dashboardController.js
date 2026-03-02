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
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const userRole = req.user.userRole;

    if (!userId) {
      return res.failure({ message: 'User ID is required' });
    }

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

    // Today range (IST) for "today joined" calculations
    const todayStart = moment(todayStr, 'YYYY-MM-DD').startOf('day').toDate();
    const todayEnd = moment(todayStr, 'YYYY-MM-DD').endOf('day').toDate();

    const baseWhere = {
      companyId,
      refId: userId,
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    };

    if (userRole === 5) {
      const nsdlPanWhere = {
        ...baseWhere,
        serviceType: 'Pan'
      };

      const aeps1Where = {
        ...baseWhere
      };

      const aeps2Where = {
        ...baseWhere
      };

      const mobileWhere = {
        ...baseWhere,
        serviceType: 'Mobile1Recharge'
      };

      const dthWhere = {
        ...baseWhere,
        serviceType: 'DTHRecharge'
      };

      const payoutWhere = {
        ...baseWhere
      };

      const a1topMobileWhere = { ...baseWhere, serviceType: 'Mobile2Recharge' };
      const a1topDthWhere = { ...baseWhere, serviceType: 'DTH2Recharge' };
      const a1topPanWhere = { ...baseWhere, serviceType: 'Pan2' };

      const [
        nsdlPanTotalVolume,
        nsdlPanTotalCount,
        nsdlPanSuccessCount,
        nsdlPanPendingCount,
        nsdlPanFailedCount,
        nsdlPanRetailerComm,
        aeps1TotalVolume,
        aeps1TotalCount,
        aeps1SuccessCount,
        aeps1PendingCount,
        aeps1FailedCount,
        aeps1RetailerComm,
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
        mobileRetailerComm,
        dthTotalVolume,
        dthTotalCount,
        dthSuccessCount,
        dthPendingCount,
        dthFailedCount,
        dthRetailerComm,
        payoutTotalVolume,
        payoutTotalCount,
        payoutSuccessCount,
        payoutPendingCount,
        payoutFailedCount,
        // A1 Top Mobile
        a1topMobileTotalVolume,
        a1topMobileTotalCount,
        a1topMobileSuccessCount,
        a1topMobilePendingCount,
        a1topMobileFailedCount,
        a1topMobileRetailerComm,
        // A1 Top DTH
        a1topDthTotalVolume,
        a1topDthTotalCount,
        a1topDthSuccessCount,
        a1topDthPendingCount,
        a1topDthFailedCount,
        a1topDthRetailerComm,
        // A1 Top PAN
        a1topPanTotalVolume,
        a1topPanTotalCount,
        a1topPanSuccessCount,
        a1topPanPendingCount,
        a1topPanFailedCount,
        a1topPanRetailerComm
      ] = await Promise.all([
        // NSDL PAN
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
        model.serviceTransaction.sum('retailerCom', {
          where: { ...nsdlPanWhere, status: 'SUCCESS' }
        }),

        // AEPS 1
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
        model.aepsHistory.sum('retailerCom', {
          where: { ...aeps1Where, status: 'SUCCESS' }
        }),

        // AEPS 2 (Practomind)
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

        // Mobile Recharge
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
        model.serviceTransaction.sum('retailerCom', {
          where: { ...mobileWhere, status: 'SUCCESS' }
        }),

        // DTH
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
        model.serviceTransaction.sum('retailerCom', {
          where: { ...dthWhere, status: 'SUCCESS' }
        }),

        // Payout
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
        // A1 Top Mobile
        model.service1Transaction.sum('amount', { where: a1topMobileWhere }),
        model.service1Transaction.count({ where: a1topMobileWhere }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('retailerCom', { where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        // A1 Top DTH
        model.service1Transaction.sum('amount', { where: a1topDthWhere }),
        model.service1Transaction.count({ where: a1topDthWhere }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('retailerCom', { where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        // A1 Top PAN
        model.service1Transaction.sum('amount', { where: a1topPanWhere }),
        model.service1Transaction.count({ where: a1topPanWhere }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('retailerCom', { where: { ...a1topPanWhere, status: 'SUCCESS' } })
      ]);

      // Calculate total retailer commission from all services
      const retailerCommission = roundToTwo(
        (nsdlPanRetailerComm || 0) +
        (aeps1RetailerComm || 0) +
        (mobileRetailerComm || 0) +
        (dthRetailerComm || 0) +
        (a1topMobileRetailerComm || 0) +
        (a1topDthRetailerComm || 0) +
        (a1topPanRetailerComm || 0)
      );

      return res.success({
        message: 'Dashboard statistics fetched successfully',
        data: {
          filters: {
            fromDay,
            toDay,
            companyId,
            userId
          },
          commissions: {
            retailerCommission,
            totalCommission: retailerCommission
          },
          services: {
            inspayPan: {
              label: 'Inspay PAN',
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
            inspayMobile: {
              label: 'Inspay Mobile Recharge',
              totalVolume: roundToTwo(mobileTotalVolume || 0),
              totalCount: mobileTotalCount || 0,
              successCount: mobileSuccessCount || 0,
              pendingCount: mobilePendingCount || 0,
              failedCount: mobileFailedCount || 0
            },
            inspayDth: {
              label: 'Inspay DTH Recharge',
              totalVolume: roundToTwo(dthTotalVolume || 0),
              totalCount: dthTotalCount || 0,
              successCount: dthSuccessCount || 0,
              pendingCount: dthPendingCount || 0,
              failedCount: dthFailedCount || 0
            },
            payout: {
              label: 'Payout',
              totalVolume: roundToTwo(payoutTotalVolume || 0),
              totalCount: payoutTotalCount || 0,
              successCount: payoutSuccessCount || 0,
              pendingCount: payoutPendingCount || 0,
              failedCount: payoutFailedCount || 0
            },
            a1topMobile: {
              label: 'A1 Top Mobile Recharge',
              totalVolume: roundToTwo(a1topMobileTotalVolume || 0),
              totalCount: a1topMobileTotalCount || 0,
              successCount: a1topMobileSuccessCount || 0,
              pendingCount: a1topMobilePendingCount || 0,
              failedCount: a1topMobileFailedCount || 0
            },
            a1topDth: {
              label: 'A1 Top DTH Recharge',
              totalVolume: roundToTwo(a1topDthTotalVolume || 0),
              totalCount: a1topDthTotalCount || 0,
              successCount: a1topDthSuccessCount || 0,
              pendingCount: a1topDthPendingCount || 0,
              failedCount: a1topDthFailedCount || 0
            },
            a1topPan: {
              label: 'A1 Top PAN',
              totalVolume: roundToTwo(a1topPanTotalVolume || 0),
              totalCount: a1topPanTotalCount || 0,
              successCount: a1topPanSuccessCount || 0,
              pendingCount: a1topPanPendingCount || 0,
              failedCount: a1topPanFailedCount || 0
            }
          }
        }
      });
    }
    else if (userRole === 4) {
      // Get all downline users (retailers) reporting to this distributor
      const downlineUsers = await model.user.findAll({
        where: {
          reportingTo: userId,
          companyId,
          isDeleted: false
        },
        attributes: ['id', 'createdAt']
      });

      const downlineUserIds = downlineUsers.map((user) => user.id);

      // Today joined downlines (retailers created today under this distributor)
      const todayJoinedDownlineCount = await model.user.count({
        where: {
          reportingTo: userId,
          companyId,
          isDeleted: false,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      });

      // Combine distributor's own ID with downline user IDs for transaction queries
      const allUserIds = [userId, ...downlineUserIds];

      // Base where clause for both distributor's own transactions and downline transactions
      const combinedBaseWhere = {
        companyId,
        refId: {
          [Op.in]: allUserIds
        },
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      };

      const nsdlPanWhere = {
        ...combinedBaseWhere,
        serviceType: 'Pan1'
      };

      const aeps1Where = {
        ...combinedBaseWhere
      };

      const aeps2Where = {
        ...combinedBaseWhere
      };

      const mobileWhere = {
        ...combinedBaseWhere,
        serviceType: 'Mobile1Recharge'
      };

      const dthWhere = {
        ...combinedBaseWhere,
        serviceType: 'DTH1Recharge'
      };

      const payoutWhere = {
        ...combinedBaseWhere
      };

      // A1 Top where clauses (from service1Transaction)
      const a1topMobileWhere = { ...combinedBaseWhere, serviceType: 'Mobile2Recharge' };
      const a1topDthWhere = { ...combinedBaseWhere, serviceType: 'DTH2Recharge' };
      const a1topPanWhere = { ...combinedBaseWhere, serviceType: 'Pan2' };

      const [
        nsdlPanTotalVolume,
        nsdlPanTotalCount,
        nsdlPanSuccessCount,
        nsdlPanPendingCount,
        nsdlPanFailedCount,
        nsdlPanDistributorComm,
        aeps1TotalVolume,
        aeps1TotalCount,
        aeps1SuccessCount,
        aeps1PendingCount,
        aeps1FailedCount,
        aeps1DistributorComm,
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
        mobileDistributorComm,
        dthTotalVolume,
        dthTotalCount,
        dthSuccessCount,
        dthPendingCount,
        dthFailedCount,
        dthDistributorComm,
        payoutTotalVolume,
        payoutTotalCount,
        payoutSuccessCount,
        payoutPendingCount,
        payoutFailedCount,
        // A1 Top Mobile
        a1topMobileTotalVolume,
        a1topMobileTotalCount,
        a1topMobileSuccessCount,
        a1topMobilePendingCount,
        a1topMobileFailedCount,
        a1topMobileDistributorComm,
        // A1 Top DTH
        a1topDthTotalVolume,
        a1topDthTotalCount,
        a1topDthSuccessCount,
        a1topDthPendingCount,
        a1topDthFailedCount,
        a1topDthDistributorComm,
        // A1 Top PAN
        a1topPanTotalVolume,
        a1topPanTotalCount,
        a1topPanSuccessCount,
        a1topPanPendingCount,
        a1topPanFailedCount,
        a1topPanDistributorComm
      ] = await Promise.all([
        // NSDL PAN
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
        model.serviceTransaction.sum('distributorCom', {
          where: { ...nsdlPanWhere, status: 'SUCCESS' }
        }),

        // AEPS 1
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
        model.aepsHistory.sum('distributorCom', {
          where: { ...aeps1Where, status: 'SUCCESS' }
        }),

        // AEPS 2 (Practomind)
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

        // Mobile Recharge
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
        model.serviceTransaction.sum('distributorCom', {
          where: { ...mobileWhere, status: 'SUCCESS' }
        }),

        // DTH
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
        model.serviceTransaction.sum('distributorCom', {
          where: { ...dthWhere, status: 'SUCCESS' }
        }),

        // Payout
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
        // A1 Top Mobile
        model.service1Transaction.sum('amount', { where: a1topMobileWhere }),
        model.service1Transaction.count({ where: a1topMobileWhere }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('distributorCom', { where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        // A1 Top DTH
        model.service1Transaction.sum('amount', { where: a1topDthWhere }),
        model.service1Transaction.count({ where: a1topDthWhere }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('distributorCom', { where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        // A1 Top PAN
        model.service1Transaction.sum('amount', { where: a1topPanWhere }),
        model.service1Transaction.count({ where: a1topPanWhere }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('distributorCom', { where: { ...a1topPanWhere, status: 'SUCCESS' } })
      ]);

      // Calculate total distributor commission from all services
      // This includes commission from distributor's own transactions and from downline transactions
      const distributorCommission = roundToTwo(
        (nsdlPanDistributorComm || 0) +
        (aeps1DistributorComm || 0) +
        (mobileDistributorComm || 0) +
        (dthDistributorComm || 0) +
        (a1topMobileDistributorComm || 0) +
        (a1topDthDistributorComm || 0) +
        (a1topPanDistributorComm || 0)
      );

      return res.success({
        message: 'Dashboard statistics fetched successfully',
        data: {
          filters: {
            fromDay,
            toDay,
            companyId,
            userId
          },
          downlineCount: downlineUserIds.length,
          todayJoinedDownlineCount,
          commissions: {
            distributorCommission,
            totalCommission: distributorCommission
          },
          services: {
            inspayPan: {
              label: 'Inspay PAN',
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
            inspayMobile: {
              label: 'Inspay Mobile Recharge',
              totalVolume: roundToTwo(mobileTotalVolume || 0),
              totalCount: mobileTotalCount || 0,
              successCount: mobileSuccessCount || 0,
              pendingCount: mobilePendingCount || 0,
              failedCount: mobileFailedCount || 0
            },
            inspayDth: {
              label: 'Inspay DTH Recharge',
              totalVolume: roundToTwo(dthTotalVolume || 0),
              totalCount: dthTotalCount || 0,
              successCount: dthSuccessCount || 0,
              pendingCount: dthPendingCount || 0,
              failedCount: dthFailedCount || 0
            },
            payout: {
              label: 'Payout',
              totalVolume: roundToTwo(payoutTotalVolume || 0),
              totalCount: payoutTotalCount || 0,
              successCount: payoutSuccessCount || 0,
              pendingCount: payoutPendingCount || 0,
              failedCount: payoutFailedCount || 0
            },
            a1topMobile: {
              label: 'A1 Top Mobile Recharge',
              totalVolume: roundToTwo(a1topMobileTotalVolume || 0),
              totalCount: a1topMobileTotalCount || 0,
              successCount: a1topMobileSuccessCount || 0,
              pendingCount: a1topMobilePendingCount || 0,
              failedCount: a1topMobileFailedCount || 0
            },
            a1topDth: {
              label: 'A1 Top DTH Recharge',
              totalVolume: roundToTwo(a1topDthTotalVolume || 0),
              totalCount: a1topDthTotalCount || 0,
              successCount: a1topDthSuccessCount || 0,
              pendingCount: a1topDthPendingCount || 0,
              failedCount: a1topDthFailedCount || 0
            },
            a1topPan: {
              label: 'A1 Top PAN',
              totalVolume: roundToTwo(a1topPanTotalVolume || 0),
              totalCount: a1topPanTotalCount || 0,
              successCount: a1topPanSuccessCount || 0,
              pendingCount: a1topPanPendingCount || 0,
              failedCount: a1topPanFailedCount || 0
            }
          }
        }
      });
    }
    else if (userRole === 3) {
      // Master Distributor statistics: include own transactions + distributors + retailers under them

      // 1. Get all distributors directly reporting to this master distributor
      const distributors = await model.user.findAll({
        where: {
          reportingTo: userId,
          companyId,
          userRole: 4,
          isDeleted: false
        },
        attributes: ['id']
      });

      const distributorIds = distributors.map((user) => user.id);

      // Today joined distributors under this master distributor
      const todayDistributorJoinedCount = await model.user.count({
        where: {
          reportingTo: userId,
          companyId,
          userRole: 4,
          isDeleted: false,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      });

      // 2. Get all retailers reporting either directly to master distributor or to its distributors
      const retailers = await model.user.findAll({
        where: {
          reportingTo: {
            [Op.in]: distributorIds.length ? [userId, ...distributorIds] : [userId]
          },
          companyId,
          userRole: 5,
          isDeleted: false
        },
        attributes: ['id']
      });

      const retailerIds = retailers.map((user) => user.id);

      // Today joined retailers under master distributor (direct or via distributors)
      const todayRetailerJoinedCount = await model.user.count({
        where: {
          reportingTo: {
            [Op.in]: distributorIds.length ? [userId, ...distributorIds] : [userId]
          },
          companyId,
          userRole: 5,
          isDeleted: false,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      });

      const downlineUserIds = [...distributorIds, ...retailerIds];

      // Combine master distributor's own ID with all downline user IDs for transaction queries
      const allUserIds = [userId, ...downlineUserIds];

      const combinedBaseWhere = {
        companyId,
        refId: {
          [Op.in]: allUserIds
        },
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      };

      const nsdlPanWhere = {
        ...combinedBaseWhere,
        serviceType: 'Pan1'
      };

      const aeps1Where = {
        ...combinedBaseWhere
      };

      const aeps2Where = {
        ...combinedBaseWhere
      };

      const mobileWhere = {
        ...combinedBaseWhere,
        serviceType: 'Mobile1Recharge'
      };

      const dthWhere = {
        ...combinedBaseWhere,
        serviceType: 'DTH1Recharge'
      };

      const payoutWhere = {
        ...combinedBaseWhere
      };

      // A1 Top where clauses (from service1Transaction)
      const a1topMobileWhere = { ...combinedBaseWhere, serviceType: 'Mobile2Recharge' };
      const a1topDthWhere = { ...combinedBaseWhere, serviceType: 'DTH2Recharge' };
      const a1topPanWhere = { ...combinedBaseWhere, serviceType: 'Pan2' };

      const [
        nsdlPanTotalVolume,
        nsdlPanTotalCount,
        nsdlPanSuccessCount,
        nsdlPanPendingCount,
        nsdlPanFailedCount,
        nsdlPanMasterDistributorComm,
        aeps1TotalVolume,
        aeps1TotalCount,
        aeps1SuccessCount,
        aeps1PendingCount,
        aeps1FailedCount,
        aeps1MasterDistributorComm,
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
        mobileMasterDistributorComm,
        dthTotalVolume,
        dthTotalCount,
        dthSuccessCount,
        dthPendingCount,
        dthFailedCount,
        dthMasterDistributorComm,
        payoutTotalVolume,
        payoutTotalCount,
        payoutSuccessCount,
        payoutPendingCount,
        payoutFailedCount,
        // A1 Top Mobile
        a1topMobileTotalVolume,
        a1topMobileTotalCount,
        a1topMobileSuccessCount,
        a1topMobilePendingCount,
        a1topMobileFailedCount,
        a1topMobileMasterDistributorComm,
        // A1 Top DTH
        a1topDthTotalVolume,
        a1topDthTotalCount,
        a1topDthSuccessCount,
        a1topDthPendingCount,
        a1topDthFailedCount,
        a1topDthMasterDistributorComm,
        // A1 Top PAN
        a1topPanTotalVolume,
        a1topPanTotalCount,
        a1topPanSuccessCount,
        a1topPanPendingCount,
        a1topPanFailedCount,
        a1topPanMasterDistributorComm
      ] = await Promise.all([
        // NSDL PAN
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
        model.serviceTransaction.sum('masterDistributorCom', {
          where: { ...nsdlPanWhere, status: 'SUCCESS' }
        }),

        // AEPS 1
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
        model.aepsHistory.sum('masterDistributorCom', {
          where: { ...aeps1Where, status: 'SUCCESS' }
        }),

        // AEPS 2 (Practomind) - no commission fields, only stats
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

        // Mobile Recharge
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
        model.serviceTransaction.sum('masterDistributorCom', {
          where: { ...mobileWhere, status: 'SUCCESS' }
        }),

        // DTH
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
        model.serviceTransaction.sum('masterDistributorCom', {
          where: { ...dthWhere, status: 'SUCCESS' }
        }),

        // Payout (no commission fields for master distributor)
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
        // A1 Top Mobile
        model.service1Transaction.sum('amount', { where: a1topMobileWhere }),
        model.service1Transaction.count({ where: a1topMobileWhere }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topMobileWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('masterDistributorCom', { where: { ...a1topMobileWhere, status: 'SUCCESS' } }),
        // A1 Top DTH
        model.service1Transaction.sum('amount', { where: a1topDthWhere }),
        model.service1Transaction.count({ where: a1topDthWhere }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topDthWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('masterDistributorCom', { where: { ...a1topDthWhere, status: 'SUCCESS' } }),
        // A1 Top PAN
        model.service1Transaction.sum('amount', { where: a1topPanWhere }),
        model.service1Transaction.count({ where: a1topPanWhere }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'SUCCESS' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'PENDING' } }),
        model.service1Transaction.count({ where: { ...a1topPanWhere, status: 'FAILURE' } }),
        model.service1Transaction.sum('masterDistributorCom', { where: { ...a1topPanWhere, status: 'SUCCESS' } })
      ]);

      // Calculate total master distributor commission from all services
      // This includes commission from master distributor's own transactions and from downline transactions
      const masterDistributorCommission = roundToTwo(
        (nsdlPanMasterDistributorComm || 0) +
        (aeps1MasterDistributorComm || 0) +
        (mobileMasterDistributorComm || 0) +
        (dthMasterDistributorComm || 0) +
        (a1topMobileMasterDistributorComm || 0) +
        (a1topDthMasterDistributorComm || 0) +
        (a1topPanMasterDistributorComm || 0)
      );

      return res.success({
        message: 'Dashboard statistics fetched successfully',
        data: {
          filters: {
            fromDay,
            toDay,
            companyId,
            userId
          },
          downline: {
            distributorCount: distributorIds.length,
            retailerCount: retailerIds.length,
            totalDownlineUsers: downlineUserIds.length,
            todayDistributorJoinedCount,
            todayRetailerJoinedCount,
            todayTotalJoinedDownlineUsers:
              todayDistributorJoinedCount + todayRetailerJoinedCount
          },
          commissions: {
            masterDistributorCommission,
            totalCommission: masterDistributorCommission
          },
          services: {
            inspayPan: {
              label: 'Inspay PAN',
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
            inspayMobile: {
              label: 'Inspay Mobile Recharge',
              totalVolume: roundToTwo(mobileTotalVolume || 0),
              totalCount: mobileTotalCount || 0,
              successCount: mobileSuccessCount || 0,
              pendingCount: mobilePendingCount || 0,
              failedCount: mobileFailedCount || 0
            },
            inspayDth: {
              label: 'Inspay DTH Recharge',
              totalVolume: roundToTwo(dthTotalVolume || 0),
              totalCount: dthTotalCount || 0,
              successCount: dthSuccessCount || 0,
              pendingCount: dthPendingCount || 0,
              failedCount: dthFailedCount || 0
            },
            payout: {
              label: 'Payout',
              totalVolume: roundToTwo(payoutTotalVolume || 0),
              totalCount: payoutTotalCount || 0,
              successCount: payoutSuccessCount || 0,
              pendingCount: payoutPendingCount || 0,
              failedCount: payoutFailedCount || 0
            },
            a1topMobile: {
              label: 'A1 Top Mobile Recharge',
              totalVolume: roundToTwo(a1topMobileTotalVolume || 0),
              totalCount: a1topMobileTotalCount || 0,
              successCount: a1topMobileSuccessCount || 0,
              pendingCount: a1topMobilePendingCount || 0,
              failedCount: a1topMobileFailedCount || 0
            },
            a1topDth: {
              label: 'A1 Top DTH Recharge',
              totalVolume: roundToTwo(a1topDthTotalVolume || 0),
              totalCount: a1topDthTotalCount || 0,
              successCount: a1topDthSuccessCount || 0,
              pendingCount: a1topDthPendingCount || 0,
              failedCount: a1topDthFailedCount || 0
            },
            a1topPan: {
              label: 'A1 Top PAN',
              totalVolume: roundToTwo(a1topPanTotalVolume || 0),
              totalCount: a1topPanTotalCount || 0,
              successCount: a1topPanSuccessCount || 0,
              pendingCount: a1topPanPendingCount || 0,
              failedCount: a1topPanFailedCount || 0
            }
          }
        }
      });
    }

    return res.failure({ message: 'You are not authorized to access this resource' });
  } catch (error) {
    console.error('Error in getDashboard', error);
    return res.failure({ message: error.message });
  }
};

module.exports = {
  getDashboard
};