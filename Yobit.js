const
    rp = require('request-promise'),
    CryptoJS = require('crypto-js'),
    querystring = require("querystring"),

    apiHost = 'https://yobit.net',
    publicApiSufix = 'api/3',
    privateApiSufix = 'tapi',
    publicApiUrl = `${apiHost}/${publicApiSufix}`,
    privateApiUrl = `${apiHost}/${privateApiSufix}`;


/** Yobit api class */
class Yobit {
    /**
     * @param {string} key - Public API key
     * @param {string} secret - Private API key (secret)
     * @param {object} options
     * @param {number} options.nonce - Optional. Last request nonce value
     * @param {function} options.nonceUpdateFn - Optional. Function to track and update nonce value
     * @param {string} options.proxyUrl - Optional. Proxy url for request.
     * @constructor
     */
    constructor(key, secret, options) {
        const {nonce, nonceUpdateFn, proxyUrl} = options;
        this.key = key;
        this.secret = secret;
        this.proxyUrl = proxyUrl;
        this.nonce = nonce || Math.floor(+new Date()/1000);
        this.nonceUpdateFn = nonceUpdateFn || ((nonce) => nonce + 1);
    }

    static _publicUrl(method) {
        return `${publicApiUrl}/${method}`;
    }

    static _formatPairs(pairs) {
        if(Array.isArray(pairs)) return pairs.join('-').toLowerCase();
        return pairs.toLowerCase();
    }

    static _sign(message, secret){
        return CryptoJS.HmacSHA512(message, secret).toString(CryptoJS.enc.hex);
    }

    /**
     * Get info about available pairs
     * @return {Promise} {
            "server_time":1418654531,
            "pairs":{
                "ltc_btc":{
                    "decimal_places":8,
                    "min_price":0.00000001,
                    "max_price":10000,
                    "min_amount":0.0001,
                    "hidden":0,
                    "fee":0.2
                }
                ...
            }
        }
     */
    static info () {
        return rp({uri: Yobit._publicUrl('info'), json: true});
    }

    /**
     * Get statistic information about pair for the last 24 hours.
     * @param {string/Array} pairs - xxx_xxx/['xxx_xxx', ...] (ex. btc_usd)
     * @return {Promise} {
            "ltc_btc":{
                "high":105.41,
                "low":104.67,
                "avg":105.04,
                "vol":43398.22251455,
                "vol_cur":4546.26962359,
                "last":105.11,
                "buy":104.2,
                "sell":105.11,
                "updated":1418654531
            }
            ...
        }
     */
    static ticker(pairs) {
        return rp({uri: Yobit._publicUrl(`ticker/${Yobit._formatPairs(pairs)}`), json: true});
    }

    /**
     * Get information about the lists of active orders of the specified pairs.
     * @param {string/Array} pairs - xxx_xxx/['xxx_xxx', ...] (ex. btc_usd)
     * @param {number} limit
     * @return {Promise} {
            "ltc_btc":{
                "asks":[
                    [104.67,0.01],
                    [104.75,11],
                    [104.80,0.523],
                    ...
                ],
                "bids":[
                    [104.3,5.368783],
                    [104.212,2.57357],
                    [103.62,0.43663336],
                    [103.61,0.7255672],
                    ...
                ]
            }
            ...
        }
     */
    static depth(pairs, limit=100) {
        return rp({
            uri: Yobit._publicUrl(`depth/${Yobit._formatPairs(pairs)}`),
            json: true,
            qs: {limit}
        });
    }

    /**
     * Get information on recent transactions of specified pairs.
     * @param {string/Array} pairs - xxx_xxx/['xxx_xxx', ...] (ex. btc_usd)
     * @return {Promise} {
            "ltc_btc":[
                {
                    "type":"ask",
                    "price":104.2,
                    "amount":0.101,
                    "tid":41234426,
                    "timestamp":1418654531
                },
                {
                    "type":"bid",
                    "price":103.53,
                    "amount":1.51414,
                    "tid":41234422,
                    "timestamp":1418654530
                },
                ...
            ]
            ...
        }
     */

    static trades(pairs) {
        return rp({uri: Yobit._publicUrl(`trades/${Yobit._formatPairs(pairs)}`), json: true});
    }

    async _request(cfg) {
        cfg = {...cfg};
        if(typeof cfg.headers === 'undefined') cfg.headers = {};
        else cfg.headers = {...cfg.headers};
        this.nonce = await this.nonceUpdateFn(this.nonce);
        console.log("------------------NONCE IS ", this.nonce, querystring.stringify(cfg.form));
        cfg.form = cfg.form || {};
        cfg.form.nonce = this.nonce;
        cfg.headers["key"] = this.key;
        cfg.headers["sign"] = Yobit._sign(querystring.stringify(cfg.form), this.secret);

        if(!cfg.proxy) cfg.proxy = this.proxyUrl;
        cfg.json = true;
        return rp(cfg);
    }


    /**
     * Get information about user balances and API key privileges, as well as server time.
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "funds":{
                    "ltc":22,
                    "nvc":423.998,
                    "ppc":10,
                    ...
                },
                "funds_incl_orders":{
                    "ltc":32,
                    "nvc":523.998,
                    "ppc":20,
                    ...
                },
                "rights":{
                    "info":1,
                    "trade":0,
                    "withdraw":0
                },
                "transaction_count":0,
                "open_orders":1,
                "server_time":1418654530
            }
        }
     * funds: account balance available for use (does not include money on open orders)
     * funds_incl_orders: account balance available for use (includes money on open orders)
     * key access - 'info'
     */
    getInfo() {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'getInfo'
            }
        });
    }

    /**
     * Create new order for trading on the exchange
     * @param {string} pair - xxx_xxx (ex. btc_usd)
     * @param {string} type - buy or sell
     * @param {number} rate - price of amount
     * @param {number} amount - order size
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "received":0.1,
                "remains":0,
                "order_id":12345,
                "funds":{
                    "btc":15,
                    "ltc":51.82,
                    "nvc":0,
                    ...
                }
            }
        }
     * key access - 'info&trade'
     */
    Trade(pair, type, rate, amount) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'Trade',
                pair: Yobit._formatPairs(pair),
                type,
                rate,
                amount
            }
        });
    }

    /**
     * Get list of active user orders.
     * @param {string} pair - xxx_xxx (ex. btc_usd)
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "100025362":{
                    "pair":"ltc_btc",
                    "type":"sell",
                    "amount":21.615,
                    "rate":0.258,
                    "timestamp_created":1418654530,
                    "status":0
                },
                ...
            }
        }
     * key access - 'info'
     */
    ActiveOrders(pair) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'ActiveOrders',
                pair: Yobit._formatPairs(pair)
            }
        });
    }

    /**
     * Get detailed information about order.
     * @param {number} order_id
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "100025362":{
                    "pair":ltc_btc,
                    "type":sell,
                    "start_amount":13.345,
                    "amount":12.345,
                    "rate":485,
                    "timestamp_created":1418654530,
                    "status":0
                }
            }
        }
     * status: 0 - active, 1 - executed and closed, 2 - canceled, 3 - canceled, but was partially executed.
     * key access - 'info'
     */
    OrderInfo(order_id) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'OrderInfo',
                order_id
            }
        });
    }

    /**
     * The method cancels the specified order.
     * @param order_id
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "order_id":100025362,
                "funds":{
                    "btc":15,
                    "ltc":51.82,
                    "nvc":0,
                    ...
                }
            }
        }
     * key access - 'info&trade'
     */
    CancelOrder(order_id) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'CancelOrder',
                order_id
            }
        });
    }

    /**
     * The method returns the history of transactions.
     * @param {Object} options - {from, count, from_id, end_id, order, since, end, pair}
     * from: the number of the transaction to start the output from (value: numeric, default: 0)
     * count: the number of trades to display (value: numeric, default: 1000)
     * from_id: ID of the transaction with which to start output (value: numeric, default: 0)
     * end_id: ID of the transaction on which to end the output (value: numeric, default: ∞)
     * order: sort on output (value: ASC or DESC, default: DESC)
     * since: at what time to start output (value: unix time, default: 0)
     * end: at what time to end the output (value: unix time, default: ∞)
     * pair: pair (example: ltc_btc)
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "24523":{
                    "pair":"ltc_btc",
                    "type":"sell",
                    "amount":11.4,
                    "rate":0.145,
                    "order_id":100025362,
                    "is_your_order":1,
                    "timestamp":1418654530
                }
                ...
            }
        }
     * When using the since parameter, the maximum date by which to get the history is a week ago.
     * key access - 'info'
     */
    TradeHistory(options={}) {
        const {from, count, from_id, end_id, order, since, end, pair} = options;
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'TradeHistory',
                from, count, from_id, end_id, order, since, end, pair
            }
        });
    }

    /**
     * The method returns the recharge address.
     * @param {string} coinName - XXX (ex. BTC)
     * @param {number} need_new - value: 0 or 1, default: 0
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "address": 1UHAnAWvxDB9XXETsi7z483zRRBmcUZxb3,
                "processed_amount": 1.00000000,
                "server_time": 1437146228
            }
        }
     * key access - 'deposits'
     */
    GetDepositAddress(coinName, need_new=0) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'GetDepositAddress',
                coinName,
                need_new
            }
        });
    }

    /**
     * The method creates a request for withdrawal of funds.
     * @param {string} coinName - XXX (ex. BTC)
     * @param {number} amount
     * @param {string} address
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "server_time": 1437146228
            }
        }
     * key access - 'withdrawals'
     */
    WithdrawCoinsToAddress(coinName, amount, address) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'WithdrawCoinsToAddress',
                coinName,
                amount,
                address
            }
        });
    }

    /**
     * The method is designed to create Yobicodes (coupons).
     * @param {string} currency - XXX (ex. BTC
     * @param amount
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "coupon": "YOBITUZ0HHSTBCOH5F6EAOENCRD8RGOQX3H01BTC",
                "transID": 1,
                "funds":{
                    "btc":15,
                    "ltc":51.82,
                    "nvc":0,
                    ...
                }
            }
        }
     * key access - 'withdrawals'
     */
    CreateYobicode(currency, amount) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'CreateYobicode',
                currency,
                amount
            }
        });
    }

    /**
     * The method is designed to redeem Yobicodes (coupons).
     * @param {string} coupon
     * @return {Promise<*>} {
            "success":1,
            "return":{
                "couponAmount": "1.2345",
                "couponCurrency": "BTC",
                "transID": 1,
                "funds":{
                    "btc":15,
                    "ltc":51.82,
                    "nvc":0,
                    ...
                }
            }
        }
     * couponAmount: The amount that was credited.
     * couponCurrency: The yobicode currency that was credited.
     * transID: always 1 for compatibility with api of other exchanges.
     * funds: balances relevant upon request
     * key access - 'deposits'
     */
    RedeemYobicode(coupon) {
        return this._request({
            uri: privateApiUrl,
            method: 'POST',
            form: {
                method: 'RedeemYobicode',
                coupon
            }
        });
    }
}

module.exports = Yobit;