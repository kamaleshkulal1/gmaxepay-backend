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
    const userId = req.user && req.user.id;
    const companyId = req.user && req.user.companyId;
    const userRole = req.user && req.user.userRole;

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

    if (userRole === 5 ) {
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
        serviceType: 'MobileRecharge'
      };

      const dthWhere = {
        ...baseWhere,
        serviceType: 'DTHRecharge'
      };

      const payoutWhere = {
        ...baseWhere
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
        payoutTotalVolume,
        payoutTotalCount,
        payoutSuccessCount,
        payoutPendingCount,
        payoutFailedCount
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
        })
      ]);

      return res.success({
        message: 'Dashboard statistics fetched successfully',
        data: {
          filters: {
            fromDay,
            toDay,
            companyId,
            userId
          },
          role: userRole,
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
    }
    else if(userRole === 4){
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
        serviceType: 'Pan'
      };

      const aeps1Where = {
        ...combinedBaseWhere
      };

      const aeps2Where = {
        ...combinedBaseWhere
      };

      const mobileWhere = {
        ...combinedBaseWhere,
        serviceType: 'MobileRecharge'
      };

      const dthWhere = {
        ...combinedBaseWhere,
        serviceType: 'DTHRecharge'
      };

      const payoutWhere = {
        ...combinedBaseWhere
      };

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
        payoutFailedCount
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
        })
      ]);

      // Calculate total distributor commission from all services
      // This includes commission from distributor's own transactions and from downline transactions
      const distributorCommission = roundToTwo(
        (nsdlPanDistributorComm || 0) +
        (aeps1DistributorComm || 0) +
        (mobileDistributorComm || 0) +
        (dthDistributorComm || 0)
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
          role: userRole,
          downlineCount: downlineUserIds.length,
          todayJoinedDownlineCount,
          commissions: {
            distributorCommission,
            totalCommission: distributorCommission
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
    }
    else if(userRole === 3){
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
        serviceType: 'Pan'
      };

      const aeps1Where = {
        ...combinedBaseWhere
      };

      const aeps2Where = {
        ...combinedBaseWhere
      };

      const mobileWhere = {
        ...combinedBaseWhere,
        serviceType: 'MobileRecharge'
      };

      const dthWhere = {
        ...combinedBaseWhere,
        serviceType: 'DTHRecharge'
      };

      const payoutWhere = {
        ...combinedBaseWhere
      };

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
        payoutFailedCount
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
        })
      ]);

      // Calculate total master distributor commission from all services
      // This includes commission from master distributor's own transactions and from downline transactions
      const masterDistributorCommission = roundToTwo(
        (nsdlPanMasterDistributorComm || 0) +
        (aeps1MasterDistributorComm || 0) +
        (mobileMasterDistributorComm || 0) +
        (dthMasterDistributorComm || 0)
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
          role: userRole,
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