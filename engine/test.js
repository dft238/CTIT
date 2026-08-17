/* CTIT 本地引擎冒烟测试（Node.js，无依赖） */
const assert = require('assert');
const { createCTITEngine } = require('./ctit-engine.js');

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}

const ctit = createCTITEngine();

console.log('# parseDeadline 截止日期解析');
ok('三天内 → 72h', () => assert.strictEqual(ctit.parseDeadline('三天内'), 72));
ok('半小时 → 0.5h', () => assert.strictEqual(ctit.parseDeadline('半小时'), 0.5));
ok('半天 → 12h', () => assert.strictEqual(ctit.parseDeadline('半天'), 12));
ok('五天后 → 120h', () => assert.strictEqual(ctit.parseDeadline('五天后'), 120));
ok('两周 → 336h', () => assert.strictEqual(ctit.parseDeadline('两周'), 336));
ok('明天 → 24~48h', () => {
  const v = ctit.parseDeadline('明天交');
  assert(v > 24 && v < 48, 'expected 24~48, got ' + v);
});
ok('无截止 → 720h 默认', () => assert.strictEqual(ctit.parseDeadline('写论文'), 720));
ok('尽快 → 12h', () => assert.strictEqual(ctit.parseDeadline('尽快完成'), 12));

console.log('# classifyTask 类别分类');
ok('写论文 → 学术研究', () => assert.strictEqual(ctit.classifyTask('写论文').name, '学术研究'));
ok('复习期末 → 考试学习', () => assert.strictEqual(ctit.classifyTask('复习期末考试').name, '考试学习'));
ok('写代码 → 工作项目', () => assert.strictEqual(ctit.classifyTask('写代码').name, '工作项目'));
ok('运动 → 生活健康', () => assert.strictEqual(ctit.classifyTask('运动').name, '生活健康'));

console.log('# cleanTaskName 名称清洗');
ok('复习期末考试三天内 → 复习期末考试', () => assert.strictEqual(ctit.cleanTaskName('复习期末考试三天内'), '复习期末考试'));
ok('写论文（重要） → 写论文', () => assert.strictEqual(ctit.cleanTaskName('写论文（重要）'), '写论文'));

console.log('# analyze 主入口');
const tasks = ctit.analyze('写论文\n复习期末考试三天内');
ok('返回 2 个事务', () => assert.strictEqual(tasks.length, 2));
ok('事务参数均有效', () => {
  for (const t of tasks) {
    assert(t.T_impact > 0, 'T_impact');
    assert(t.T_cost > 0, 'T_cost');
    assert(t.T_remain > 0, 'T_remain');
  }
});
ok('名称被清洗', () => assert.strictEqual(tasks[1].name, '复习期末考试'));

console.log('# 优先级');
const hi = { T_impact: 20, T_remain: 2, T_cost: 1 };
ok('TROI=10 → P1', () => {
  assert.strictEqual(ctit.calcTROI(hi), 10);
  assert.strictEqual(ctit.getPriorityLevel(ctit.calcTROI(hi)).label, 'P1');
});

console.log('# PID 校准');
const engine2 = createCTITEngine();
ok('无偏置时校正=原值', () => assert.strictEqual(engine2.applyPIDCorrection(100), 100));
ok('recordCompletion 更新积分', () => {
  const t = { T_impact: 20, completed: false };
  engine2.recordCompletion(t, 10, 5); // 误差 +10
  assert.strictEqual(engine2.pid.integral, 10);
  assert.strictEqual(engine2.pid.completedCount, 1);
  assert.strictEqual(t.completed, true);
});

console.log('\n全部 ' + passed + ' 项测试通过 ✅');
