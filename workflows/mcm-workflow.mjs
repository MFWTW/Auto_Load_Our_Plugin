/**
 * mcm-workflow — 数学建模六阶段流程工作流（文件夹工作流文件）
 *
 * 放在任意工作目录的 `.dsh/workflows/` 下，由工作流加载器
 * 在会话开始时自动发现并加载。注册模型工具 `mcm_stage_guide`：
 *   - stage=0（默认）：总览（五大原则、六阶段、参考资料策略、写作硬性要求）
 *   - stage=1~6：该阶段检查清单 + 产出要求
 *
 * 流程：审题 → 数据分析 → 选方法 → 建模求解 → 写作 → 自检打磨
 *
 * 写作阶段（stage=5）硬性要求：
 *   1. 论文以 DOCX 文件撰写，完成后转换为 PDF 提交；
 *   2. 必须生成并插入图表：框图、算法流程图、数据可视化图、
 *      结果表格、检验图表（参考工作目录下 1-1~3-2.pdf 七篇获奖论文）。
 */

export const name = '数学建模六阶段流程'
export const description = '审题→数据分析→选方法→建模求解→写作→自检打磨；提供 mcm_stage_guide 工具按阶段指引。写作阶段要求：论文写成 DOCX 再转 PDF，且必须生成并插入框图、算法流程图、数据图表与结果表格（借鉴目录下 7 篇获奖论文 PDF 的图表风格）。'

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
      '求解过程同步留存作图数据：拟合曲线、残差、仿真轨迹、灵敏度曲线等，供写作阶段画图',
    ],
    output: '每问的模型 + 结果 + 检验 + 可作图数据',
  },
  {
    id: 5,
    title: '写作（DOCX → PDF，图表/流程图齐全）',
    checks: [
      '必备结构齐全：标题、摘要与关键词、问题重述、问题分析、模型假设、符号说明、模型建立与求解、逐问落地、模型分析与检验（可改名灵敏度分析等）、模型评价、参考文献（正文标注 [2-4,6]）、附录（代码/中间数据/详细图表）',
      '摘要覆盖所有问题 + 每问方法与关键结果：先出各问初稿再统写（全局最准），或每问即写最后统一打磨',
      '【输出格式】论文写成 DOCX 文件（建议用 python-docx 生成正文与表格），写完转换 PDF 提交（LibreOffice 无头模式：soffice --headless --convert-to pdf 论文.docx）；先出 DOCX 再转 PDF，不要直接输出纯文本',
      '【图表硬性要求】正文必须生成并插入以下五类图表（参考工作目录 1-1~3-2.pdf 七篇获奖论文的图表风格）：',
      '（1）框图：整体建模思路/模型体系框图（如“数据 → 方法 → 模型 → 结果”链条）；',
      '（2）算法流程图：核心算法或求解流程的流程图（回归、规划、仿真等步骤）；',
      '（3）数据可视化图：数据分布图、热力图、散点图、拟合曲线图（matplotlib 等生成 PNG 插入 DOCX）；',
      '（4）结果表格：数据表、参数表、结果对比表（用 docx 表格呈现，不用截图）；',
      '（5）检验图表：残差图、灵敏度分析图、仿真结果图、误差对比表。',
      '图表规范：图/表均有编号（图 1、表 1）+ 标题；坐标轴标签、单位、图例齐全；关键结果必须表格化；每个公式、每张图都要“有来源、有用处、有解释”',
    ],
    output: '论文初稿：DOCX 文件（已嵌入框图、算法流程图、数据图、结果表格、检验图表）+ 转换后的 PDF',
    paperRefs: [
      '工作目录 7 篇获奖论文 PDF（1-1、1-2、2-1、2-2、2-3、3-1、3-2）——写作前至少浏览 2-3 篇，借鉴其图表类型与论文结构',
      '典型可借鉴图表：2-2 热力图与聚类图、2-3 影响因素交集图、3-2 多项式拟合曲线图、各篇结果对比表与分级表',
      '各篇优缺点与获奖等级分析见 1-1.md~3-2.md、获奖等级评判.md，可对照学习“图表怎么画、数据怎么摆”',
    ],
  },
  {
    id: 6,
    title: '自检打磨',
    checks: [
      '摘要：全问题覆盖、方法+结果齐备、精炼',
      '图和表：框图、算法流程图、表格、模型结果、结果检验齐全精细；编号/标题/坐标轴/单位/图例一个不少',
      '【格式终检】确认已产出 DOCX 并成功转换为 PDF；PDF 中图表清晰、无乱码、表格未截断',
      '模型建立与分析：为什么用、怎么推导、与问题怎么对应、结果怎么分析',
      '模型假设：合理、逐条说明必要性',
      '最关键部分零错别字：标题、摘要、公式、图表标题、结论',
      '避开四条红线：套路化（套搬套公式）、应用题化（只有结果没有分析）、模板化（千篇一律）、形式化（公式/图表华而不实——每个都要有来源、有用处、有解释）',
    ],
    output: '终稿：DOCX + PDF（评委视角过关）',
  },
]

const references = [
  '选论文优先 985 / 211 / 双一流院校',
  '本硕博论文：方法细、脉络清晰（本科论文尤佳）→ 学“完整流程”',
  '科研论文：有创新点但细节简略 → 学“出新意”',
  '用法：本硕博论文打底 + 科研论文提亮，再对照阶段 5、6 清单自查',
]

const writingRequirements = [
  '论文用 DOCX 撰写，完成后转换为 PDF 提交（先 DOCX 后 PDF）',
  '必须生成并插入：框图、算法流程图、数据可视化图、结果表格、检验图表',
  '图表参考工作目录 1-1~3-2.pdf 七篇获奖论文的风格与规范',
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
    lines.push('', '## 写作阶段硬性要求（DOCX→PDF + 图表流程图）')
    value.writingRequirements.forEach((r) => { lines.push('- ' + r) })
    lines.push('', '## 参考资料策略')
    value.references.forEach((r) => { lines.push('- ' + r) })
  } else if (value.mode === 'stage') {
    lines.push('# 阶段 ' + value.stage + ' · ' + value.title, '', '## 检查清单')
    value.checks.forEach((c, i) => { lines.push((i + 1) + '. [ ] ' + c) })
    lines.push('', '## 产出', value.output)
    if (value.paperRefs && value.paperRefs.length) {
      lines.push('', '## 参考论文（7 篇获奖 PDF）')
      value.paperRefs.forEach((r) => { lines.push('- ' + r) })
    }
    lines.push('', '## 五大原则提醒')
    value.principles.forEach((pr, i) => { lines.push((i + 1) + '. ' + pr) })
  } else {
    return JSON.stringify(value)
  }
  return lines.join('\n')
}

/** 注册模型工具 mcm_stage_guide。 */
export function apply(ctx) {
  // 运行上报桥（由工作流加载器注入）：阶段进度自动同步到右侧「工作流运行」面板
  const runs = ctx.workflowRuns ?? null
  ctx.tools.register({
    name: 'mcm_stage_guide',
    description: '数学建模六阶段流程指引（审题→数据分析→选方法→建模求解→写作→自检打磨）。做数学建模类题目时按阶段调用：每阶段开始前调用一次，获取该阶段检查清单与产出要求；stage=0 或省略返回总览（五大原则、六阶段概览、写作硬性要求、参考资料策略）。写作阶段（stage=5）强制要求：论文写 DOCX 再转 PDF，并生成插入框图、算法流程图、数据图表与结果表格，可参考工作目录 1-1~3-2.pdf 七篇获奖论文。',
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
      // 六阶段路线图（含每阶段实时状态）：供右侧面板详情展示
      const roadmap = (current, allDone = false) => stages.map((s) => ({
        id: s.id,
        title: s.title,
        output: s.output,
        status: allDone ? 'done' : (current <= 0 ? 'pending' : (s.id < current ? 'done' : (s.id === current ? 'active' : 'pending'))),
      }))
      if (n === 0) {
        runs?.report({ stage: 0, status: 'running', stages: roadmap(0), message: '工作流已就绪：六阶段路线图（审题→数据分析→选方法→建模求解→写作→自检打磨）' })
        return {
          mode: 'overview',
          flow: '审题 → 数据分析 → 选方法 → 建模求解 → 写作（DOCX→PDF，图表/流程图齐全）→ 自检打磨',
          principles,
          stages: stages.map((s) => ({ id: s.id, title: s.title, output: s.output })),
          writingRequirements,
          references,
        }
      }
      const stage = stages.find((s) => s.id === n)
      if (!stage) {
        runs?.report({ status: 'failed', result: 'stage 必须为 0-6 的整数，收到：' + String(n) })
        return { error: 'stage 必须为 0-6 的整数，收到：' + String(n) }
      }
      // 自动上报进度：写入路线图状态、当前动作与活动日志；阶段 6 视为工作流完成
      const stageMsg = '阶段 ' + stage.id + '「' + stage.title + '」进行中 → 产出：' + stage.output
      if (n >= 6) {
        runs?.report({ stage: n, status: 'completed', stages: roadmap(n, true), message: stageMsg, result: '阶段 6「' + stage.title + '」完成，产出：' + stage.output })
      } else {
        runs?.report({ stage: n, status: 'running', stages: roadmap(n), message: stageMsg })
      }
      return {
        mode: 'stage',
        stage: stage.id,
        title: stage.title,
        checks: stage.checks,
        output: stage.output,
        paperRefs: stage.paperRefs,
        principles,
      }
    },
  })
}
