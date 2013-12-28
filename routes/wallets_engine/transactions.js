(function() {
  var Payment, Transaction, User, Wallet, async, restify;

  restify = require("restify");

  async = require("async");

  User = require("../../models/user");

  Wallet = require("../../models/wallet");

  Transaction = require("../../models/transaction");

  Payment = require("../../models/payment");

  module.exports = function(app) {
    var loadEntireAccountBalance, processPayment;
    app.put("/transaction/:currency/:tx_id", function(req, res, next) {
      var currency, txId;
      txId = req.params.tx_id;
      currency = req.params.currency;
      GLOBAL.wallets[currency].getTransaction(txId, function(err, transaction) {
        if (err) {
          console.error(err);
        }
        if (transaction && transaction.details[0].category !== "move") {
          if (transaction.details[0].account) {
            return User.findById(transaction.details[0].account, function(err, user) {
              if (user) {
                return Wallet.findUserWalletByCurrency(user.id, currency, function(err, wallet) {
                  Transaction.addFromWallet(transaction, currency, user, wallet);
                  if (wallet) {
                    return loadEntireAccountBalance(wallet);
                  }
                });
              } else {
                return Transaction.addFromWallet(transaction, currency, user);
              }
            });
          } else {
            return Transaction.addFromWallet(transaction, currency);
          }
        }
      });
      return res.end();
    });
    app.post("/process_pending_payments", function(req, res, next) {
      var processPayment;
      processPayment = function(payment, callback) {
        return Wallet.findById(payment.wallet_id, function(err, wallet) {
          if (wallet.canWithdraw(payment.amount)) {
            return wallet.addBalance(-payment.amount, function(err) {
              if (!err) {
                return processPayment(payment, function(err) {
                  if (!err) {
                    return callback(null, "" + payment.id + " - processed");
                  } else {
                    return wallet.addBalance(payment.amount, function() {
                      return callback(null, "" + payment.id + " - not processed - " + err);
                    });
                  }
                });
              } else {
                return callback(null, "" + payment.id + " - not processed - " + err);
              }
            });
          } else {
            return callback(null, "" + payment.id + " - not processed - no funds");
          }
        });
      };
      return Payment.find({
        status: "pending"
      }).exec(function(err, payments) {
        return async.mapSeries(payments, processPayment, function(err, result) {
          if (err) {
            console.log(err);
          }
          return console.log(result);
        });
      });
    });
    loadEntireAccountBalance = function(wallet, callback) {
      var _this = this;
      if (callback == null) {
        callback = function() {};
      }
      return GLOBAL.wallets[wallet.currency].getBalance(wallet.account, function(err, balance) {
        if (err) {
          console.error("Could not get balance for " + wallet.account, err);
          return callback(err, _this);
        } else {
          if (balance !== 0) {
            return GLOBAL.wallets[wallet.currency].chargeAccount(wallet.account, -balance, function(err, success) {
              if (err) {
                console.error("Could not charge " + wallet.account + " " + balance + " BTC", err);
                return callback(err, _this);
              } else {
                return wallet.addBalance(balance, callback);
              }
            });
          } else {
            return Wallet.findById(wallet.id, callback);
          }
        }
      });
    };
    return processPayment = function(payment, callback) {
      var account,
        _this = this;
      if (callback == null) {
        callback = function() {};
      }
      account = GLOBAL.wallets[payment.currency].account;
      return GLOBAL.wallets[payment.currency].sendToAddress(payment.address, account, payment.amount, function(err, response) {
        if (response == null) {
          response = "";
        }
        if (err) {
          console.error("Could not withdraw to " + payment.address + " from " + account + " " + payment.amount + " BTC", err);
          return payment.errored(JSON.stringify(err), callback);
        } else {
          return payment.process(JSON.stringify(response), callback);
        }
      });
    };
  };

}).call(this);
