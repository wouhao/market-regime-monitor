/**
 * BTC 市场分析独立模块
 * 只做描述/诊断：价格趋势 + 杠杆/流动性状态
 * 禁止输出任何 BTC 买卖/仓位/杠杆建议
 * 与 US equities 执行开关完全隔离
 */

// BTC 状态类型
export type BtcState = "S1" | "S2" | "S3" | "S4";
export type LiquidityTag = "Expanding" | "Contracting" | "Unknown";
export type BtcConfidence = "watch" | "confirmed";

// 证据链数据结构
export interface BtcEvidence {
  price: {
    latest: number | null;
    pct7d: number | null;
    pct30d: number | null;
    asOf: string;
  };
  oi: {
    latest: number | null;
    pct7d: number | null;
    abs7d: number | null;
    asOf: string;
  };
  funding: {
    latest: number | null;
    avg7d: number | null;
    asOf: string;
  };
  liquidations: {
    h24: number | null;
    total7d: number | null;
    avg7d: number | null;
    asOf: string;
    missingDays?: number;
  };
  stablecoin: {
    latest: number | null;
    pct7d: number | null;
    pct30d: number | null;
    asOf: string;
  };
  exchangeNetflow: {
    value: null;
    reason: string;
  };
  missingFields: string[];
}

// BTC 分析结果
export interface BtcAnalysisResult {
  state: BtcState;
  liquidityTag: LiquidityTag;
  confidence: BtcConfidence;
  evidence: BtcEvidence;
  stateReasons: string[]; // 触发状态的具体原因
}

// 输入数据结构
export interface BtcAnalysisInput {
  // 当前快照数据
  btcPrice: number | null;
  btcPrice7dPct: number | null;
  btcPrice30dPct: number | null;
  fundingLatest: number | null;
  oiLatest: number | null;
  liq24h: number | null;
  stablecoinLatest: number | null;
  stablecoin7dPct: number | null;
  stablecoin30dPct: number | null;
  
  // 历史数据（用于计算7D指标）
  oi7dAgo: number | null;
  funding7dHistory: (number | null)[]; // 过去7天的funding值
  liq7dHistory: (number | null)[]; // 过去7天的liq24h值
  
  // 上一次报告的BTC状态（用于判断confirmed）
  previousBtcState: BtcState | null;
  
  // 数据日期
  asOfDate: string;
}

/**
 * 计算 OI 7D 变化
 */
function calculateOi7dChange(oiLatest: number | null, oi7dAgo: number | null): { pct: number | null; abs: number | null } {
  if (oiLatest === null || oi7dAgo === null || oi7dAgo === 0) {
    return { pct: null, abs: null };
  }
  const pct = ((oiLatest / oi7dAgo) - 1) * 100;
  const abs = oiLatest - oi7dAgo;
  return { pct, abs };
}

/**
 * 计算 Funding 7D 平均
 * 任一天缺失 → missing
 */
function calculateFunding7dAvg(funding7dHistory: (number | null)[]): number | null {
  if (funding7dHistory.length < 7) {
    return null;
  }
  // 检查是否有任何缺失值
  if (funding7dHistory.some(v => v === null || v === undefined)) {
    return null;
  }
  const sum = funding7dHistory.reduce((acc: number, v) => acc + (v as number), 0);
  return sum / 7;
}

/**
 * 计算 Liquidations 7D total/avg
 * 任一天缺失 → missing，并记录 missing_days
 */
function calculateLiq7d(liq7dHistory: (number | null)[]): { total: number | null; avg: number | null; missingDays: number } {
  if (liq7dHistory.length < 7) {
    return { total: null, avg: null, missingDays: 7 - liq7dHistory.length };
  }
  
  const missingDays = liq7dHistory.filter(v => v === null || v === undefined).length;
  
  // 任一天缺失 → missing
  if (missingDays > 0) {
    return { total: null, avg: null, missingDays };
  }
  
  const total = liq7dHistory.reduce((acc: number, v) => acc + (v as number), 0);
  const avg = total / 7;
  return { total, avg, missingDays: 0 };
}

/**
 * 判断流动性标签
 */
function determineLiquidityTag(stablecoin7dPct: number | null, stablecoin30dPct: number | null): LiquidityTag {
  if (stablecoin7dPct === null || stablecoin30dPct === null) {
    return "Unknown";
  }
  
  if (stablecoin7dPct > 0 && stablecoin30dPct > 0) {
    return "Expanding";
  }
  
  if (stablecoin7dPct < 0 || stablecoin30dPct < 0) {
    return "Contracting";
  }
  
  return "Unknown";
}

/**
 * 判断 BTC 状态（S1-S4）
 * 
 * S1 杠杆堆积：OI↑ + funding偏正/升 + 价格上行（满足2条）
 * S2 去杠杆/出清：价格7D<-5% + OI↓ + 清算上升（满足2条）
 * S3 低杠杆修复：价格回升 + OI不升/小升 + 清算回落 + funding不极端（满足2条）
 * S4 中性/混合：不满足以上或数据缺失多
 */
function determineBtcState(
  price7dPct: number | null,
  oi7dPct: number | null,
  fundingLatest: number | null,
  funding7dAvg: number | null,
  liq24h: number | null,
  liq7dAvg: number | null,
  missingFields: string[]
): { state: BtcState; reasons: string[] } {
  // 数据缺失多 → S4
  if (missingFields.length >= 2) {
    return { state: "S4", reasons: [`数据缺失过多: ${missingFields.join(", ")}`] };
  }
  
  const s1Conditions: string[] = [];
  const s2Conditions: string[] = [];
  const s3Conditions: string[] = [];
  
  // S1 条件检查：杠杆堆积
  // OI 7D > +5%
  if (oi7dPct !== null && oi7dPct > 5) {
    s1Conditions.push(`OI 7D +${oi7dPct.toFixed(1)}% > +5%`);
  }
  // funding 偏正/升（latest > 0 且 latest > 7d avg）
  if (fundingLatest !== null && fundingLatest > 0) {
    if (funding7dAvg !== null && fundingLatest > funding7dAvg) {
      s1Conditions.push(`Funding ${(fundingLatest * 100).toFixed(4)}% > 0 且上升`);
    } else if (funding7dAvg === null) {
      s1Conditions.push(`Funding ${(fundingLatest * 100).toFixed(4)}% > 0`);
    }
  }
  // 价格上行（7D > 0）
  if (price7dPct !== null && price7dPct > 0) {
    s1Conditions.push(`Price 7D +${price7dPct.toFixed(1)}% > 0`);
  }
  
  // S2 条件检查：去杠杆/出清
  // 价格 7D < -5%
  if (price7dPct !== null && price7dPct < -5) {
    s2Conditions.push(`Price 7D ${price7dPct.toFixed(1)}% < -5%`);
  }
  // OI 下降（7D < 0）
  if (oi7dPct !== null && oi7dPct < 0) {
    s2Conditions.push(`OI 7D ${oi7dPct.toFixed(1)}% < 0`);
  }
  // 清算上升（24h > 7d avg * 1.5）
  if (liq24h !== null && liq7dAvg !== null && liq7dAvg > 0 && liq24h > liq7dAvg * 1.5) {
    s2Conditions.push(`Liq 24h $${(liq24h / 1e6).toFixed(0)}M > 7D avg $${(liq7dAvg / 1e6).toFixed(0)}M × 1.5`);
  }
  
  // S3 条件检查：低杠杆修复
  // 价格回升（7D > 0）
  if (price7dPct !== null && price7dPct > 0) {
    s3Conditions.push(`Price 7D +${price7dPct.toFixed(1)}% > 0`);
  }
  // OI 不升/小升（7D <= +2%）
  if (oi7dPct !== null && oi7dPct <= 2) {
    s3Conditions.push(`OI 7D ${oi7dPct >= 0 ? '+' : ''}${oi7dPct.toFixed(1)}% ≤ +2%`);
  }
  // 清算回落（24h < 7d avg）
  if (liq24h !== null && liq7dAvg !== null && liq24h < liq7dAvg) {
    s3Conditions.push(`Liq 24h $${(liq24h / 1e6).toFixed(0)}M < 7D avg $${(liq7dAvg / 1e6).toFixed(0)}M`);
  }
  // funding 不极端（|funding| < 0.05%）
  if (fundingLatest !== null && Math.abs(fundingLatest) < 0.0005) {
    s3Conditions.push(`Funding ${(fundingLatest * 100).toFixed(4)}% 不极端`);
  }
  
  // 判断状态（满足2条）
  if (s1Conditions.length >= 2) {
    return { state: "S1", reasons: s1Conditions };
  }
  if (s2Conditions.length >= 2) {
    return { state: "S2", reasons: s2Conditions };
  }
  if (s3Conditions.length >= 2) {
    return { state: "S3", reasons: s3Conditions };
  }
  
  // 不满足以上 → S4
  const allConditions = [
    ...s1Conditions.map(c => `[S1] ${c}`),
    ...s2Conditions.map(c => `[S2] ${c}`),
    ...s3Conditions.map(c => `[S3] ${c}`),
  ];
  return { 
    state: "S4", 
    reasons: allConditions.length > 0 
      ? [`未满足任一状态的2条阈值: ${allConditions.join("; ")}`]
      : ["数据不足以判断状态"]
  };
}

/**
 * 判断可信度
 * 连续2次状态相同 → confirmed
 * 否则 → watch
 * 关键字段缺失 → 强制 watch
 */
function determineConfidence(
  currentState: BtcState,
  previousState: BtcState | null,
  missingFields: string[]
): BtcConfidence {
  // 关键字段缺失 → 强制 watch
  if (missingFields.length >= 1) {
    return "watch";
  }
  
  // 连续2次状态相同 → confirmed
  if (previousState !== null && currentState === previousState) {
    return "confirmed";
  }
  
  return "watch";
}

/**
 * 执行 BTC 市场分析
 */
export function analyzeBtcMarket(input: BtcAnalysisInput): BtcAnalysisResult {
  const missingFields: string[] = [];
  
  // 计算 OI 7D 变化
  const oi7dChange = calculateOi7dChange(input.oiLatest, input.oi7dAgo);
  if (oi7dChange.pct === null) {
    missingFields.push("oi_7d");
  }
  
  // 计算 Funding 7D 平均
  const funding7dAvg = calculateFunding7dAvg(input.funding7dHistory);
  if (funding7dAvg === null && input.funding7dHistory.length > 0) {
    missingFields.push("funding_7d_avg");
  }
  
  // 计算 Liquidations 7D
  const liq7d = calculateLiq7d(input.liq7dHistory);
  if (liq7d.total === null) {
    missingFields.push("liq_7d");
  }
  
  // 检查其他缺失字段
  if (input.btcPrice === null) missingFields.push("btc_price");
  if (input.btcPrice7dPct === null) missingFields.push("btc_price_7d");
  if (input.fundingLatest === null) missingFields.push("funding_latest");
  if (input.oiLatest === null) missingFields.push("oi_latest");
  if (input.liq24h === null) missingFields.push("liq_24h");
  if (input.stablecoinLatest === null) missingFields.push("stablecoin_latest");
  if (input.stablecoin7dPct === null) missingFields.push("stablecoin_7d");
  if (input.stablecoin30dPct === null) missingFields.push("stablecoin_30d");
  
  // 判断流动性标签
  const liquidityTag = determineLiquidityTag(input.stablecoin7dPct, input.stablecoin30dPct);
  
  // 判断 BTC 状态
  const { state, reasons } = determineBtcState(
    input.btcPrice7dPct,
    oi7dChange.pct,
    input.fundingLatest,
    funding7dAvg,
    input.liq24h,
    liq7d.avg,
    missingFields
  );
  
  // 判断可信度
  const confidence = determineConfidence(state, input.previousBtcState, missingFields);
  
  // 构建证据链
  const evidence: BtcEvidence = {
    price: {
      latest: input.btcPrice,
      pct7d: input.btcPrice7dPct,
      pct30d: input.btcPrice30dPct,
      asOf: input.asOfDate,
    },
    oi: {
      latest: input.oiLatest,
      pct7d: oi7dChange.pct,
      abs7d: oi7dChange.abs,
      asOf: input.asOfDate,
    },
    funding: {
      latest: input.fundingLatest,
      avg7d: funding7dAvg,
      asOf: input.asOfDate,
    },
    liquidations: {
      h24: input.liq24h,
      total7d: liq7d.total,
      avg7d: liq7d.avg,
      asOf: input.asOfDate,
      missingDays: liq7d.missingDays > 0 ? liq7d.missingDays : undefined,
    },
    stablecoin: {
      latest: input.stablecoinLatest,
      pct7d: input.stablecoin7dPct,
      pct30d: input.stablecoin30dPct,
      asOf: input.asOfDate,
    },
    exchangeNetflow: {
      value: null,
      reason: "missing - data source not implemented",
    },
    missingFields,
  };
  
  return {
    state,
    liquidityTag,
    confidence,
    evidence,
    stateReasons: reasons,
  };
}

/**
 * 格式化 BTC 分析结果为文本（用于 AI 输出）
 * 禁止输出任何交易建议
 */
export function formatBtcAnalysisForAI(result: BtcAnalysisResult): string {
  const { state, liquidityTag, confidence, evidence, stateReasons } = result;
  
  const stateLabels: Record<BtcState, string> = {
    S1: "杠杆堆积",
    S2: "去杠杆/出清",
    S3: "低杠杆修复",
    S4: "中性/混合",
  };
  
  const lines: string[] = [
    `### BTC 市场分析`,
    `- **状态**: ${state} ${stateLabels[state]}（${confidence}）`,
    `- **流动性**: ${liquidityTag}`,
    `- **证据链**:`,
  ];
  
  // Price
  if (evidence.price.latest !== null) {
    lines.push(`  - Price: $${evidence.price.latest.toLocaleString()} | 7D: ${evidence.price.pct7d !== null ? `${evidence.price.pct7d >= 0 ? '+' : ''}${evidence.price.pct7d.toFixed(1)}%` : 'missing'} | 30D: ${evidence.price.pct30d !== null ? `${evidence.price.pct30d >= 0 ? '+' : ''}${evidence.price.pct30d.toFixed(1)}%` : 'missing'}`);
  } else {
    lines.push(`  - Price: missing`);
  }
  
  // OI
  if (evidence.oi.latest !== null) {
    const oiStr = `$${(evidence.oi.latest / 1e9).toFixed(2)}B`;
    const oi7dPctStr = evidence.oi.pct7d !== null ? `${evidence.oi.pct7d >= 0 ? '+' : ''}${evidence.oi.pct7d.toFixed(1)}%` : 'missing';
    const oi7dAbsStr = evidence.oi.abs7d !== null ? `(${evidence.oi.abs7d >= 0 ? '+' : ''}$${(evidence.oi.abs7d / 1e6).toFixed(0)}M)` : '';
    lines.push(`  - OI: ${oiStr} | 7D: ${oi7dPctStr} ${oi7dAbsStr}`);
  } else {
    lines.push(`  - OI: missing`);
  }
  
  // Funding
  if (evidence.funding.latest !== null) {
    const fundingLatestStr = `${(evidence.funding.latest * 100).toFixed(4)}%`;
    const funding7dAvgStr = evidence.funding.avg7d !== null ? `${(evidence.funding.avg7d * 100).toFixed(4)}%` : 'missing';
    lines.push(`  - Funding: ${fundingLatestStr} | 7D avg: ${funding7dAvgStr}`);
  } else {
    lines.push(`  - Funding: missing`);
  }
  
  // Liquidations
  if (evidence.liquidations.h24 !== null) {
    const liq24hStr = `$${(evidence.liquidations.h24 / 1e6).toFixed(1)}M`;
    const liq7dTotalStr = evidence.liquidations.total7d !== null ? `$${(evidence.liquidations.total7d / 1e6).toFixed(0)}M` : 'missing';
    const liq7dAvgStr = evidence.liquidations.avg7d !== null ? `$${(evidence.liquidations.avg7d / 1e6).toFixed(0)}M` : 'missing';
    let liqLine = `  - Liq 24h: ${liq24hStr} | 7D total: ${liq7dTotalStr} | 7D avg: ${liq7dAvgStr}`;
    if (evidence.liquidations.missingDays && evidence.liquidations.missingDays > 0) {
      liqLine += ` (missing ${evidence.liquidations.missingDays} days)`;
    }
    lines.push(liqLine);
  } else {
    lines.push(`  - Liq 24h: missing`);
  }
  
  // Stablecoin
  if (evidence.stablecoin.latest !== null) {
    const stableStr = `$${(evidence.stablecoin.latest / 1e9).toFixed(1)}B`;
    const stable7dStr = evidence.stablecoin.pct7d !== null ? `${evidence.stablecoin.pct7d >= 0 ? '+' : ''}${evidence.stablecoin.pct7d.toFixed(2)}%` : 'missing';
    const stable30dStr = evidence.stablecoin.pct30d !== null ? `${evidence.stablecoin.pct30d >= 0 ? '+' : ''}${evidence.stablecoin.pct30d.toFixed(2)}%` : 'missing';
    lines.push(`  - Stablecoin: ${stableStr} | 7D: ${stable7dStr} | 30D: ${stable30dStr}`);
  } else {
    lines.push(`  - Stablecoin: missing`);
  }
  
  // Exchange netflow
  lines.push(`  - Exchange netflow: ${evidence.exchangeNetflow.reason}`);
  
  // Missing fields
  if (evidence.missingFields.length > 0) {
    lines.push(`- **缺失字段**: ${evidence.missingFields.join(", ")}`);
  }
  
  // State reasons
  if (stateReasons.length > 0) {
    lines.push(`- **状态判定依据**: ${stateReasons.join("; ")}`);
  }
  
  return lines.join("\n");
}
