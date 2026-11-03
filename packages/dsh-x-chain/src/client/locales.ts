export const NS = 'dsh-x-chain'

export const zh = {
  'nav': '动作链',
  'title': '动作链收益',
  'lead': '按会话统计 chain_run 执行了多少步、省下多少次模型往返。口径是反事实：第一步之后的每一步，假设没有银行时需要一次新的模型调用。',
  'refresh': '刷新',
  'loading': '正在读取统计…',
  'failed': '统计读取失败',
  'empty': '还没有执行过 chain_run。让模型把已经想清楚的一串动作交给它，这里就会出现记录。',
  'chains': '链调用',
  'steps': '执行步数',
  'saved': '省下往返',
  'stopped': '提前停下',
  'session': '会话',
  'last': '最近一次',
  'na': '—',
}

export const en = {
  'nav': 'Chain',
  'title': 'Chain savings',
  'lead': 'Per-session counts of chain_run steps and avoided model round trips. The counterfactual is explicit: every step after the first would have needed its own model call without the bank.',
  'refresh': 'Refresh',
  'loading': 'Reading statistics…',
  'failed': 'Could not read the statistics',
  'empty': 'No chain_run call yet. Hand the model a bank of already-decided actions and the record appears here.',
  'chains': 'Chains',
  'steps': 'Steps',
  'saved': 'Round trips saved',
  'stopped': 'Stopped early',
  'session': 'Session',
  'last': 'Last run',
  'na': '—',
}
