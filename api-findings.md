# Coinalyze API Findings

## Liquidation History
- Fields: `t` (timestamp), `l` (Longs liquidation volume), `s` (Shorts liquidation volume)
- The field names `l` and `s` ARE correct in our code
- Issue might be: `from` parameter only goes back 48h but with 1hour interval
- Or: `oi_lq_vol_denominated_in` field says some markets denominate in BASE_ASSET (BTC) not USD
- CRITICAL: We use `convert_to_usd=true` which should handle this

## Funding Rate
- Coinalyze: `value` is "Current funding rate (%)" - already in percentage
- Coinalyze funding-rate-history: candlestick format with o/h/l/c fields, values in %
- OKX raw: returns decimal like 0.0001 (= 0.01%), our code multiplies by 100 to get 0.01
- So stored value from OKX: -0.00076 means -0.076% after *100... wait no
- OKX returned: -0.0000097312843341, * 100 = -0.00097312843341
- This means -0.00097% which is essentially 0% (very small)
- The display shows -0.000761% which is correct but looks weird because it's so small

## Solution: Use Coinalyze for ALL crypto data
Since COINALYZE_API_KEY is available, use Coinalyze for:
1. Funding rate history (daily, 60 days) - already in % format
2. OI history (daily, 60 days) - with convert_to_usd=true
3. Liquidation history (daily, 60 days) - with convert_to_usd=true
4. Stablecoin: keep DefiLlama but add historical via their charts API

This gives us proper `prices` arrays for all crypto indicators!

## OI History Schema
- `candlestick_oi`: t, o, h, l, c (OHLC format for OI)
- Use `c` (close) as the daily value

## Funding Rate History Schema  
- `candlestick_fr`: t, o, h, l, c (OHLC format for funding rate)
- Values are in % already
- Use `c` (close) as the daily value

## Stablecoin Historical
- DefiLlama: `/stablecoincharts` endpoint has historical data
- Or use `/stablecoins` with `includePrices=false` for current only
