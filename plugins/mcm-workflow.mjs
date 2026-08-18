/**
 * mcm-workflow — 数学建模六阶段流程插件（文件夹插件版）
 *
 * 放在任意工作目录的 `.dsh/plugins/` 下，由 folder-plugins 加载器
 * 在会话开始时自动发现并加载。注册模型工具 `mcm_stage_guide`：
 *   - stage=0（默认）：总览（五大原则、六阶段、参考资料策略）
 *   - stage=1~6：该阶段检查清单 + 产出要求
 *
 * 流程：审题 → 数据分析 → 选方法 → 建模求解 → 写作 → 自检打磨
 */

export const name = 'mcm-workflow'

/** 工具注册需要 tools 服务；加载器会先确认服务存在再调用 apply。 */
export const inject = ['tools']

const principles = [
  '契合题意——每一步对照题目要求，不跑偏',
  '对症下药——按问题特征选方法，不是拿方法套问题',
  '验证正确性——数据、公式、程序、结果、单位、前后一致性都要查',
  '规范引用——引用处标注编号，格式如 [2-4,6]',
  '通俗 + 亮眼——让人读得懂；点明“用什么方法、为什么用它”',
]

const stages = [
  {
    id: 1,
    title: '审题',
    checks: [
      '精读题目原文 + 附件说明 + 数据表头，每个限定词不放过',
      '先复述问题再动手，确保理解与题意一致',
      '弄清每问三要素：输入（给什么数据）→ 输出（要什么结论）→ 约束（现实限制）',
    ],
    output: '问题清单（每问一句话概括本质 + 难点）',
  },
  {
    id: 2,
    title: '数据分析',
    checks: [
      '检验数据正确性，排查坏数据：缺失值、异常值、重复记录、单位/口径不一致',
      '坏数据处理方案：修正 / 剔除 / 填补（均值填补等），并记录理由（写进论文）',
    ],
    output: '数据体检报告 + 预处理方案',
  },
  {
    id: 3,
    title: '选用数学方法',
    checks: [
      '按问题特征候选方法，检查方法适用条件是否满足',
      '多组数据比对验证可行性：不局限于题目数据，可查互联网知识库/公开数据集交叉验证',
      '方法在多组数据上结果都合理，才确定使用',
    ],
    output: '方法清单（每问对应方法 + 选用理由 + 可行性验证）',
  },
  {
    id: 4,
    title: '建模与求解',
    checks: [
      '每问按“建立 → 推导 → 求解 → 结果”推进，前问结论作为后问输入',
      '关键参数尽量由数据估计，避免无依据的假设值',
      '求解后对结果做评判分析与检验：合理性、误差、灵敏度、与实际对照',
    ],
    output: '每问的模型 + 结果 + 检验',
  },
  {
    id: 5,
    title: '写作',
    checks: [
      '必备结构齐全：标题、摘要与关键词、问题重述、问题分析、模型假设、符号说明、模型建立与求解、逐问落地、模型分析与检验、模型评价、参考文献（正文标注 [2-4,6]）、附录（代码/中间数据/详细图表）',
      '摘要覆盖所有问题 + 每问方法与关键结果：先出各问初稿再统写（全局最准），或每问即写最后统一打磨',
      '图和表：编号/标题/坐标轴/单位/图例齐全，越精细越好',
    ],
    output: '论文初稿（按清单输出）',
  },
  {
    id: 6,
    title: '自检打磨',
    checks: [
      '摘要：全问题覆盖、方法+结果齐备、精炼',
      '图和表：框图、算法流程图、表格、模型结果、结果检验齐全精细',
      '模型建立与分析：为什么用、怎么推导、与问题怎么对应、结果怎么分析',
      '模型假设：合理、逐条说明必要性',
      '最关键部分零错别字：标题、摘要、公式、图表标题、结论',
      '避开四条红线：套路化（套搬套公式）、应用题化（只有结果没有分析）、模板化（千篇一律）、形式化（公式/图表华而不实——每个都要有来源、有用处、有解释）',
    ],
    output: '终稿（评委视角过关）',
  },
]

const references = [
  '选论文优先 985 / 211 / 双一流院校',
  '本硕博论文：方法细、脉络清晰（本科论文尤佳）→ 学“完整流程”',
  '科研论文：有创新点但细节简略 → 学“出新意”',
  '用法：本硕博论文打底 + 科研论文提亮，再对照阶段 5、6 清单自查',
]

function formatGuide(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (typeof value.error === 'string') return '⚠️ ' + value.error
  const lines = []
  if (value.mode === 'overview') {
    lines.push('# 数学建模六阶段流程总览', '', value.flow, '', '## 五大原则（每步都要过一遍）')
    value.principles.forEach((p, i) => { lines.push((i + 1) + '. ' + p) })
    lines.push('', '## 六阶段')
    value.stages.forEach((s) => { lines.push('- 阶段 ' + s.id + ' ' + s.title + '：产出 ' + s.output) })
    lines.push('', '## 参考资料策略')
    value.references.forEach((r) => { lines.push('- ' + r) })
  } else if (value.mode === 'stage') {
    lines.push('# 阶段 ' + value.stage + ' · ' + value.title, '', '## 检查清单')
    value.checks.forEach((c, i) => { lines.push((i + 1) + '. [ ] ' + c) })
    lines.push('', '## 产出', value.output, '', '## 五大原则提醒')
    value.principles.forEach((pr, i) => { lines.push((i + 1) + '. ' + pr) })
  } else {
    return JSON.stringify(value)
  }
  return lines.join('\n')
}

/** 注册模型工具 mcm_stage_guide。 */
export function apply(ctx) {
  ctx.tools.register({
    name: 'mcm_stage_guide',
    description: '数学建模六阶段流程指引（审题→数据分析→选方法→建模求解→写作→自检打磨）。做数学建模类题目时按阶段调用：每阶段开始前调用一次，获取该阶段检查清单与产出要求；stage=0 或省略返回总览（五大原则、六阶段概览、参考资料策略）。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stage: { type: 'number', description: '阶段编号 1-6；0 或省略返回总览' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: formatGuide(value) }],
    },
    async execute(args) {
      const n = args && typeof args.stage === 'number' ? args.stage : 0
      if (n === 0) {
        return {
          mode: 'overview',
          flow: '审题 → 数据分析 → 选方法 → 建模求解 → 写作 → 自检打磨',
          principles,
          stages: stages.map((s) => ({ id: s.id, title: s.title, output: s.output })),
          references,
        }
      }
      const stage = stages.find((s) => s.id === n)
      if (!stage) return { error: 'stage 必须为 0-6 的整数，收到：' + String(n) }
      return {
        mode: 'stage',
        stage: stage.id,
        title: stage.title,
        checks: stage.checks,
        output: stage.output,
        principles,
      }
    },
  })
}
