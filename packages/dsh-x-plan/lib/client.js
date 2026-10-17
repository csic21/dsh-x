window.__ModuleLoader__.load({ id: "dsh-x-plan", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/PlanToolRow.jsx
var import_react = __toESM(require("react"), 1);

// src/client/locales.js
var NS = "dsh-x-plan";
var zh = {
  "tool.dsh_x_plan": "\u751F\u6210\u8BA1\u5212",
  "tool.dsh_x_approve_plan": "\u6279\u51C6\u8BA1\u5212",
  "tool.dsh_x_discard_plan": "\u653E\u5F03\u8BA1\u5212",
  "tool.dsh_x_review": "\u9A8C\u6536\u8BA1\u5212",
  "tool.dsh_x_plan_status": "\u67E5\u770B\u8BA1\u5212\u72B6\u6001",
  "tool.dsh_x_revise_plan": "\u4FEE\u8BA2\u8BA1\u5212",
  "tool.dsh_x_recover_plan": "\u5904\u7406\u6267\u884C\u4E2D\u65AD",
  "state.preparing": "\u6B63\u5728\u51C6\u5907",
  "state.running": "\u8FDB\u884C\u4E2D",
  "state.done": "\u64CD\u4F5C\u5DF2\u8BB0\u5F55",
  "state.failed": "\u672A\u5B8C\u6210",
  "result.plan": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u6279\u51C6\u3002",
  "result.approve": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u6279\u51C6\u3002",
  "result.discard": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u653E\u5F03\u3002",
  "result.pass": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u901A\u8FC7\u3002",
  "result.fail": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u672A\u901A\u8FC7\u3002",
  "result.stopped": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u5DF2\u5931\u8D25 {count} \u6B21\uFF0C\u5DF2\u505C\u6B62\u7EE7\u7EED\u9A8C\u6536\u3002",
  "plan.notice": "\u8BF7\u5148\u67E5\u770B\u8BA1\u5212\u3002\u6279\u51C6\u524D\u4E0D\u4F1A\u5141\u8BB8\u6309\u8BA1\u5212\u6539\u52A8\u6587\u4EF6\uFF1B\u6279\u51C6\u65F6\u4EE5\u8BA1\u5212\u6587\u4EF6\u5F53\u65F6\u7684\u5185\u5BB9\u4E3A\u51C6\u3002",
  "approve.notice": "\u53EA\u6267\u884C\u5DF2\u6279\u51C6\u6587\u4EF6\u91CC\u7684\u6B65\u9AA4\u3002",
  "review.stopped": "\u8BF7\u67E5\u770B\u5DF2\u6709\u7F3A\u53E3\u5E76\u4E0E\u7528\u6237\u786E\u8BA4\u4E0B\u4E00\u6B65\uFF0C\u518D\u5F00\u59CB\u65B0\u4E00\u8F6E\u89C4\u5212\u3002",
  "review.missing-verdict": "\u9A8C\u6536\u7ED3\u8BBA\u7F3A\u5C11\u53EA\u542B pass \u6216 fail \u7684 dsh-x-verdict \u4EE3\u7801\u5757\u3002",
  "file.open": "\u6253\u5F00\u7ED3\u679C\u6587\u4EF6",
  "file.path": "\u7ED3\u679C\u6587\u4EF6",
  "inspect": "\u67E5\u770B\u8C03\u7528\u8BB0\u5F55",
  "legacy": "\u6B64\u5386\u53F2\u7ED3\u679C\u672A\u5305\u542B\u7ED3\u6784\u5316\u5C55\u793A\u4FE1\u606F\u3002\u4EE5\u4E0B\u4FDD\u7559\u539F\u59CB\u8BB0\u5F55\u3002",
  "snapshot": "\u672C\u6B21\u64CD\u4F5C\u7684\u5386\u53F2\u5FEB\u7167",
  "task.title": "\u8BA1\u5212\u4EFB\u52A1",
  "task.label": "\u8BA1\u5212\u4EFB\u52A1\uFF1A{goal}",
  "task.untitled": "\u672A\u547D\u540D\u4EFB\u52A1",
  "task.version": "\u7B2C {round} \u8F6E \xB7 \u4FEE\u8BA2 {revision}",
  "task.hash": "\u7248\u672C\u6307\u7EB9",
  "task.counts": "{files} \u4E2A\u6587\u4EF6 \xB7 {steps} \u4E2A\u6B65\u9AA4 \xB7 {checks} \u9879\u68C0\u67E5",
  "task.blocking": "\u8FD8\u6709 {count} \u4E2A\u95EE\u9898\u9700\u8981\u786E\u8BA4\uFF0C\u4E0D\u80FD\u6279\u51C6\u6267\u884C\u3002",
  "task.review-failed": "\u9A8C\u6536\u672A\u901A\u8FC7",
  "task.questions-open": "\u5F85\u786E\u8BA4\u95EE\u9898",
  "task.inconclusive": "\u9A8C\u6536\u8BC1\u636E\u4E0D\u8DB3",
  "task.stopped": "\u9700\u786E\u8BA4\u4E0B\u4E00\u6B65",
  "task.none": "\u65E0\u6D3B\u52A8\u4EFB\u52A1",
  "result.incomplete": "\u5C1A\u4E0D\u80FD\u786E\u8BA4\u5B8C\u6210",
  "workflow.draft": "\u7B49\u5F85\u6279\u51C6",
  "workflow.approved": "\u5DF2\u6279\u51C6",
  "workflow.executing": "\u8BB0\u5F55\u65F6\u6B63\u5728\u6267\u884C",
  "workflow.reviewing": "\u8BB0\u5F55\u65F6\u6B63\u5728\u9A8C\u6536",
  "workflow.needs_user": "\u9700\u8981\u7528\u6237\u786E\u8BA4",
  "workflow.completed": "\u9A8C\u6536\u901A\u8FC7",
  "workflow.cancelled": "\u5DF2\u653E\u5F03",
  "role.planner": "\u89C4\u5212",
  "role.executor": "\u6267\u884C",
  "role.reviewer": "\u9A8C\u6536",
  "role.current-session": "\u5F53\u524D DSH \u4F1A\u8BDD",
  "value.unavailable": "\u672A\u8BB0\u5F55",
  "files.title": "\u672C\u7248\u672C\u7684\u6587\u4EF6\u8303\u56F4",
  "files.empty": "\u672A\u5217\u51FA\u6587\u4EF6\u6539\u52A8\u3002",
  "steps.title": "\u8BA1\u5212\u6B65\u9AA4",
  "questions.title": "\u5F85\u786E\u8BA4\u95EE\u9898",
  "questions.empty": "\u6B64\u7248\u672C\u6CA1\u6709\u5F85\u786E\u8BA4\u95EE\u9898\u3002",
  "question.blocking": "\u963B\u585E",
  "question.assumption": "\u975E\u963B\u585E",
  "checks.title": "\u9A8C\u6536\u8BC1\u636E",
  "checks.summary": "{passed} \u9879\u901A\u8FC7 \xB7 {failed} \u9879\u5931\u8D25 \xB7 {inconclusive} \u9879\u4E0D\u786E\u5B9A \xB7 {pending} \u9879\u672A\u8FD0\u884C",
  "checks.empty": "\u6CA1\u6709\u5DF2\u8BB0\u5F55\u7684\u9A8C\u6536\u68C0\u67E5\u3002",
  "checks.notice": "\u68C0\u67E5\u547D\u4EE4\u53EF\u80FD\u751F\u6210\u6587\u4EF6\u6216\u4EA7\u751F\u5176\u4ED6\u526F\u4F5C\u7528\uFF0C\u4ECD\u987B\u7ECF\u8FC7\u5BBF\u4E3B\u6743\u9650\u6D41\u7A0B\uFF1B\u6B64\u5217\u8868\u672C\u8EAB\u4E0D\u662F\u6267\u884C\u6388\u6743\u3002",
  "checks.incomplete": "\u5B8C\u6210\u7ED3\u8BBA\u7F3A\u5C11\u5B8C\u6574\u3001\u4E00\u81F4\u7684\u901A\u8FC7\u8BC1\u636E\u3002\u8BF7\u67E5\u770B\u68C0\u67E5\u548C\u8C03\u7528\u8BB0\u5F55\u3002",
  "check.passed": "\u901A\u8FC7",
  "check.failed": "\u5931\u8D25",
  "check.inconclusive": "\u4E0D\u786E\u5B9A",
  "check.not-run": "\u672A\u8FD0\u884C",
  "check.exit": "\u9000\u51FA\u7801 {code}",
  "reason.title": "\u7ED3\u679C\u8BF4\u660E",
  "reason.draft_ready": "\u8349\u7A3F\u5DF2\u4FDD\u5B58\u3002\u5148\u67E5\u770B\u8BA1\u5212\u3001\u89E3\u51B3\u963B\u585E\u95EE\u9898\uFF0C\u518D\u7533\u8BF7\u5B98\u65B9\u6279\u51C6\u3002",
  "reason.operation_locked": "\u5B58\u5728\u64CD\u4F5C\u9501\uFF0C\u76F8\u5173\u5DE5\u4F5C\u53EF\u80FD\u4ECD\u5728\u8FD0\u884C\u3002\u8BF7\u5148\u6838\u5BF9\u72B6\u6001\uFF0C\u4E0D\u8981\u5F3A\u884C\u6062\u590D\u3002",
  "reason.repository_changed": "\u5DE5\u4F5C\u76EE\u5F55\u6216\u4ED3\u5E93\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u6267\u884C\u5DF2\u505C\u6B62\u3002\u8BF7\u6838\u5BF9\u5F53\u524D\u4ED3\u5E93\u548C\u5DF2\u6709\u6539\u52A8\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u65B0\u89C4\u5212\u3002",
  "reason.review_limit": "\u8FD9\u4E2A\u6279\u51C6\u7248\u672C\u5DF2\u8FBE\u5230\u9A8C\u6536\u5931\u8D25\u4E0A\u9650\u3002",
  "reason.review_inconclusive": "\u73B0\u6709\u8BC1\u636E\u4E0D\u8DB3\u4EE5\u5F97\u51FA\u53EF\u9760\u7684\u9A8C\u6536\u7ED3\u8BBA\u3002",
  "reason.interrupted_runtime": "\u4E0A\u6B21\u6267\u884C\u73AF\u5883\u5DF2\u4E2D\u65AD\uFF0C\u9700\u8981\u5148\u6838\u5BF9\u5DF2\u6709\u6539\u52A8\u3002",
  "reason.task_interrupted": "\u4E0A\u6B21\u64CD\u4F5C\u4E2D\u65AD\uFF0C\u9700\u8981\u5148\u6838\u5BF9\u5DF2\u6709\u6539\u52A8\u3002",
  "reason.recovered_interrupted_task": "\u5DF2\u5904\u7406\u5F02\u5E38\u4E2D\u65AD\uFF1B\u7EE7\u7EED\u6267\u884C\u524D\u4ECD\u9700\u91CD\u65B0\u6279\u51C6\u3002",
  "reason.legacy_requires_approval": "\u65E7\u7248\u4EFB\u52A1\u7F3A\u5C11\u65B0\u7248\u5BA1\u6279\u8BC1\u636E\uFF0C\u9700\u8981\u653E\u5F03\u540E\u91CD\u65B0\u89C4\u5212\u3002",
  "reason.discarded": "\u7528\u6237\u5DF2\u653E\u5F03\u8FD9\u8F6E\u4EFB\u52A1\uFF0C\u5DF2\u6709\u6587\u4EF6\u6539\u52A8\u4FDD\u7559\u3002",
  "reason.replaced_by_draft": "\u8FD9\u4EFD\u8349\u7A3F\u5DF2\u7531\u65B0\u7684\u89C4\u5212\u8F6E\u6B21\u66FF\u4EE3\u3002",
  "reason.multiple_active_rounds": "\u53D1\u73B0\u591A\u4E2A\u6D3B\u52A8\u4EFB\u52A1\uFF0C\u9700\u5148\u6838\u5BF9\u5E76\u660E\u786E\u653E\u5F03\u591A\u4F59\u4EFB\u52A1\u3002",
  "details.plan": "\u67E5\u770B\u8303\u56F4\u3001\u6B65\u9AA4\u4E0E\u9A8C\u6536",
  "details.record": "\u67E5\u770B\u7248\u672C\u4E0E\u539F\u59CB\u8BB0\u5F55",
  "raw.notice": "\u4EE5\u4E0B\u4FDD\u7559\u6A21\u578B\u6216\u5DE5\u5177\u539F\u6587\uFF0C\u4E0D\u968F\u754C\u9762\u8BED\u8A00\u6539\u5199\u3002",
  "raw.empty": "\u6CA1\u6709\u5DF2\u8BB0\u5F55\u7684\u6B63\u6587\u3002",
  "next.draft": "\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u63D0\u51FA\u4FEE\u6539\u8981\u6C42\uFF0C\u6216\u8BF7\u6C42\u6279\u51C6\u8FD9\u4E2A\u7248\u672C\u3002\u53EA\u6709\u5B98\u65B9\u5BA1\u6279\u5361\u4E0A\u7684\u5141\u8BB8\u624D\u662F\u6267\u884C\u6388\u6743\u3002",
  "next.questions": "\u8BF7\u5148\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u56DE\u7B54\u963B\u585E\u95EE\u9898\u5E76\u4FEE\u8BA2\u8BA1\u5212\uFF0C\u518D\u7533\u8BF7\u6279\u51C6\u3002",
  "next.approved": "\u5F53\u524D\u4F1A\u8BDD\u53EF\u6309\u6279\u51C6\u8303\u56F4\u7EE7\u7EED\uFF0C\u547D\u4EE4\u7B49\u64CD\u4F5C\u4ECD\u53D7\u5BBF\u4E3B\u6743\u9650\u63A7\u5236\u3002\u6539\u53D8\u8303\u56F4\u9700\u660E\u786E\u653E\u5F03\u65E7\u4EFB\u52A1\uFF0C\u518D\u91CD\u65B0\u89C4\u5212\u548C\u6279\u51C6\uFF1B\u5DF2\u6709\u6539\u52A8\u4E0D\u4F1A\u64A4\u9500\u3002",
  "next.executing": "\u8FD9\u662F\u8BB0\u5F55\u65F6\u7684\u6267\u884C\u72B6\u6001\uFF1B\u6700\u65B0\u8FDB\u5EA6\u8BF7\u67E5\u770B\u5F53\u524D\u4F1A\u8BDD\u6216\u8BF7\u6C42\u66F4\u65B0\u8BA1\u5212\u72B6\u6001\u3002",
  "next.reviewing": "\u8FD9\u662F\u8BB0\u5F55\u65F6\u7684\u9A8C\u6536\u72B6\u6001\u3002\u68C0\u67E5\u5B8C\u6210\u524D\uFF0C\u4E0D\u80FD\u636E\u6B64\u8BA4\u5B9A\u4EFB\u52A1\u901A\u8FC7\u3002",
  "next.needs_user": "\u5148\u6838\u5BF9\u7ED3\u679C\u8BF4\u660E\u3002\u4FDD\u7559\u8303\u56F4\u53EF\u91CD\u65B0\u7533\u8BF7\u5B98\u65B9\u6279\u51C6\uFF1B\u6539\u53D8\u8303\u56F4\u9700\u660E\u786E\u653E\u5F03\u65E7\u4EFB\u52A1\u540E\u91CD\u65B0\u89C4\u5212\u3002\u4E0D\u80FD\u81EA\u52A8\u7EE7\u7EED\u6267\u884C\u3002",
  "next.completed": "\u6B64\u7248\u672C\u5DF2\u901A\u8FC7\u8BB0\u5F55\u4E2D\u7684\u9A8C\u6536\u3002\u67E5\u770B\u5177\u4F53\u8BC1\u636E\uFF1B\u63D0\u4EA4\u3001\u63A8\u9001\u6216\u53D1\u5E03\u4ECD\u9700\u5404\u81EA\u6388\u6743\u3002",
  "next.cancelled": "\u5982\u9700\u7EE7\u7EED\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u63D0\u51FA\u65B0\u7684\u8BA1\u5212\u3002",
  "next.fail": "\u8BF7\u5F53\u524D\u4F1A\u8BDD\u5728\u6279\u51C6\u8303\u56F4\u5185\u5904\u7406\u7F3A\u53E3\u540E\u518D\u9A8C\u6536\u3002\u6269\u5927\u8303\u56F4\u9700\u660E\u786E\u653E\u5F03\u65E7\u4EFB\u52A1\uFF0C\u518D\u91CD\u65B0\u89C4\u5212\u548C\u6279\u51C6\uFF1B\u5DF2\u6709\u6539\u52A8\u4E0D\u4F1A\u64A4\u9500\u3002",
  "next.inconclusive": "\u5148\u6838\u5BF9\u7F3A\u5931\u6216\u4E0D\u786E\u5B9A\u7684\u8BC1\u636E\uFF0C\u91CD\u65B0\u7533\u8BF7\u5B98\u65B9\u6279\u51C6\u540E\u518D\u8865\u8DB3\u8BC1\u636E\u5E76\u9A8C\u6536\uFF1B\u8FD9\u4E0D\u7B49\u4E8E\u5B9E\u73B0\u5DF2\u7ECF\u5931\u8D25\u3002",
  "next.unverified": "\u8BF7\u5F53\u524D\u4F1A\u8BDD\u6838\u5BF9\u68C0\u67E5\u4E0E\u9A8C\u6536\u8BB0\u5F55\u540E\u66F4\u65B0\u72B6\u6001\uFF0C\u6682\u65F6\u4E0D\u80FD\u786E\u8BA4\u4EFB\u52A1\u5B8C\u6210\u3002",
  "next.stopped": "\u6B64\u7248\u672C\u5DF2\u8FBE\u5230\u9A8C\u6536\u5931\u8D25\u4E0A\u9650\u3002\u8BF7\u51B3\u5B9A\u662F\u5426\u91CD\u65B0\u6279\u51C6\u76F8\u540C\u8303\u56F4\uFF0C\u6216\u653E\u5F03\u540E\u91CD\u65B0\u89C4\u5212\uFF1B\u4E0D\u80FD\u81EA\u52A8\u7EE7\u7EED\u4FEE\u590D\u3002",
  "next.recover": "\u4E2D\u65AD\u9501\u5DF2\u5904\u7406\uFF0C\u4F46\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u6267\u884C\u3002\u5148\u6838\u5BF9\u5DF2\u6709\u6539\u52A8\uFF0C\u518D\u91CD\u65B0\u7533\u8BF7\u5B98\u65B9\u6279\u51C6\uFF1B\u6539\u53D8\u8303\u56F4\u9700\u653E\u5F03\u540E\u91CD\u65B0\u89C4\u5212\u3002",
  "next.none": "\u5F53\u524D\u6CA1\u6709\u6D3B\u52A8\u8BA1\u5212\u3002\u53EF\u4EE5\u5728\u4F1A\u8BDD\u4E2D\u63D0\u51FA\u76EE\u6807\u5E76\u8BF7\u6C42\u751F\u6210\u8BA1\u5212\u3002",
  "next.recovered-empty": "\u4E2D\u65AD\u9501\u5DF2\u5904\u7406\uFF0C\u6CA1\u6709\u6D3B\u52A8\u8BA1\u5212\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u6267\u884C\u4EFB\u4F55\u4EFB\u52A1\u3002\u53EF\u4EE5\u5728\u4F1A\u8BDD\u4E2D\u63D0\u51FA\u65B0\u76EE\u6807\u3002",
  "discard.notice": "\u653E\u5F03\u8BA1\u5212\u4E0D\u4F1A\u64A4\u9500\u5DF2\u7ECF\u4EA7\u751F\u7684\u6587\u4EF6\u6539\u52A8\u3002",
  "error.SESSION_KEY": "\u4F1A\u8BDD\u6807\u8BC6\u65E0\u6548\uFF0C\u4E0D\u80FD\u5B89\u5168\u5730\u5B9A\u4F4D\u8BA1\u5212\u76EE\u5F55\u3002",
  "error.DRAFT_EXISTS": "\u5DF2\u6709\u672A\u5B8C\u6210\u7684\u8BA1\u5212\u3002\u8BF7\u5148\u67E5\u770B\u72B6\u6001\uFF1B\u53EA\u6709\u672A\u6279\u51C6\u8349\u7A3F\u53EF\u4EE5\u4FEE\u8BA2\uFF0C\u5176\u4ED6\u4EFB\u52A1\u9700\u5B8C\u6210\u6216\u660E\u786E\u653E\u5F03\u540E\u518D\u89C4\u5212\u3002",
  "error.DISCARDED": "\u8FD9\u8F6E\u8BA1\u5212\u5DF2\u7ECF\u653E\u5F03\u3002",
  "error.NOT_APPROVED": "\u8FD9\u8F6E\u8BA1\u5212\u8FD8\u6CA1\u6279\u51C6\u3002",
  "error.META_MISSING": "\u8BA1\u5212\u7684\u5143\u6570\u636E\u7F3A\u5931\u3002",
  "error.META_INVALID": "\u8BA1\u5212\u7684\u5143\u6570\u636E\u4E0D\u5B8C\u6574\u3002",
  "error.PLAN_MISSING": "\u627E\u4E0D\u5230\u6307\u5B9A\u8F6E\u6B21\u7684\u8BA1\u5212\u3002",
  "error.FAMILY": "\u89C4\u5212\u8005\u548C\u9A8C\u6536\u8005\u5FC5\u987B\u662F codex\u3001claude \u6216 grok\u3002",
  "error.LAUNCH": "\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ACP \u547D\u4EE4\u3002\u8BF7\u68C0\u67E5\u5BF9\u5E94 CLI \u7684\u5B89\u88C5\u3001\u56FA\u5B9A\u7248\u672C\u548C PATH\uFF1B\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u4E0B\u8F7D\u7A0B\u5E8F\u3002",
  "error.ACP_STREAM": "ACP \u5B50\u8FDB\u7A0B\u6CA1\u6709\u63D0\u4F9B stdin/stdout\u3002",
  "error.ACP_SIZE": "ACP \u54CD\u5E94\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236\u3002",
  "error.ACP_SESSION": "ACP \u5B50\u8FDB\u7A0B\u6CA1\u6709\u8FD4\u56DE\u4F1A\u8BDD\u6807\u8BC6\u3002",
  "error.ACP_AUTH": "ACP \u4EE3\u7406\u8981\u6C42\u767B\u5F55\u3002\u8BF7\u5148\u5728\u5BF9\u5E94 CLI \u4E2D\u767B\u5F55\uFF1B\u6B64\u63D2\u4EF6\u4E0D\u4F1A\u4FDD\u5B58 API key\u3002",
  "error.ACP_CLOSED": "ACP \u8FDE\u63A5\u5DF2\u5173\u95ED\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.ACP_INVALID": "ACP \u54CD\u5E94\u4E0D\u662F\u6709\u6548\u7684 JSON-RPC \u6D88\u606F\u3002",
  "error.ACP_REQUEST": "ACP \u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u4EE3\u7406\u8FDE\u63A5\u72B6\u6001\u3002",
  "error.CANCELLED": "\u8BA1\u5212\u64CD\u4F5C\u5DF2\u53D6\u6D88\u3002",
  "error.GOAL_EMPTY": "\u76EE\u6807\u4E0D\u80FD\u4E3A\u7A7A\u3002",
  "error.CONTEXT_SIZE": "\u53C2\u8003\u6750\u6599\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\uFF0C\u8BF7\u53EA\u4FDD\u7559\u76F8\u5173\u6458\u5F55\u3002",
  "error.PLAN_FAILED": "\u89C4\u5212\u6CA1\u6709\u6B63\u5E38\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u4EE3\u7406\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  "error.REVIEW_FAILED": "\u9A8C\u6536\u6CA1\u6709\u6B63\u5E38\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u4EE3\u7406\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  "error.ACCEPTANCE_LENGTH": "\u9A8C\u6536\u547D\u4EE4\u8D85\u8FC7\u5B57\u7B26\u6570\u9650\u5236\u3002",
  "error.ACCEPTANCE_COUNT": "\u9A8C\u6536\u547D\u4EE4\u8D85\u8FC7\u6761\u6570\u9650\u5236\u3002",
  "error.NO_DRAFT": "\u6CA1\u6709\u672A\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.WRONG_ROUND": "\u6307\u5B9A\u7684\u8F6E\u6B21\u4E0D\u662F\u5F53\u524D\u672A\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.NO_DISCARD": "\u6CA1\u6709\u53EF\u4EE5\u653E\u5F03\u7684\u8BA1\u5212\u3002",
  "error.NO_APPROVED": "\u6CA1\u6709\u5DF2\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.SAME_FAMILY": "\u9A8C\u6536\u8005\u4E0D\u80FD\u4E0E\u89C4\u5212\u8005\u4F7F\u7528\u76F8\u540C\u7684\u6A21\u578B\u5BB6\u65CF\u3002",
  "error.NO_SESSION": "\u6B64\u5DE5\u5177\u9700\u8981\u5F53\u524D\u4F1A\u8BDD\uFF0C\u4F46\u8FD9\u6B21\u8C03\u7528\u6CA1\u6709\u4F1A\u8BDD\u6807\u8BC6\u3002",
  "error.STATE_READ": "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u4F1A\u8BDD\u7684\u8BA1\u5212\u72B6\u6001\uFF0C\u5DF2\u505C\u6B62\u5DE5\u5177\u6267\u884C\u3002\u8BF7\u68C0\u67E5\u8BA1\u5212\u76EE\u5F55\u540E\u91CD\u8BD5\u3002",
  "error.DRAFT_UNAPPROVED": "\u5F53\u524D\u8BA1\u5212\u8FD8\u6CA1\u6279\u51C6\u3002\u8BF7\u7528\u6237\u786E\u8BA4\u540E\u6279\u51C6\uFF0C\u6216\u653E\u5F03\u8FD9\u4EFD\u8BA1\u5212\u3002",
  "error.ACP_CLEANUP": "\u5916\u90E8\u9002\u914D\u5668\u6CA1\u6709\u6B63\u5E38\u505C\u6B62\uFF0C\u672C\u6B21\u64CD\u4F5C\u4E0D\u80FD\u89C6\u4E3A\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u5BF9\u5E94 CLI \u7684\u8FDB\u7A0B\u72B6\u6001\u3002",
  "error.ACP_PROTOCOL": "ACP \u534F\u8BAE\u7248\u672C\u4E0D\u517C\u5BB9\u3002\u8BF7\u68C0\u67E5\u5DF2\u5B89\u88C5\u9002\u914D\u5668\u7684\u7248\u672C\u3002",
  "error.ACP_IDENTITY": "\u9002\u914D\u5668\u6CA1\u6709\u63D0\u4F9B\u5B8C\u6574\u7684\u540D\u79F0\u548C\u7248\u672C\uFF0C\u65E0\u6CD5\u6838\u5BF9\u672C\u6B21\u4F7F\u7528\u7684\u7A0B\u5E8F\u3002",
  "error.ACP_IDENTITY_CHANGED": "\u9002\u914D\u5668\u7A0B\u5E8F\u3001\u540D\u79F0\u6216\u7248\u672C\u5728\u9884\u68C0\u540E\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u9884\u68C0\u89C4\u5212\u8005\u548C\u9A8C\u6536\u8005\u3002",
  "error.ACP_MODE": "\u65E0\u6CD5\u4FDD\u6301\u8981\u6C42\u7684\u53EA\u8BFB\u6A21\u5F0F\uFF0C\u5916\u90E8\u4EFB\u52A1\u5DF2\u505C\u6B62\u3002\u8BF7\u68C0\u67E5\u9002\u914D\u5668\u7684\u6A21\u5F0F\u652F\u6301\u3002",
  "error.ACP_MODE_UNSUPPORTED": "\u9002\u914D\u5668\u6CA1\u6709\u652F\u6301\u6240\u9700\u7684\u53EA\u8BFB\u6A21\u5F0F\uFF0C\u4E0D\u4F1A\u53D1\u9001\u4EFB\u52A1\u3002\u8BF7\u9009\u62E9\u652F\u6301\u8BE5\u6A21\u5F0F\u7684\u5DF2\u5B89\u88C5\u9002\u914D\u5668\u3002",
  "error.READONLY_UNAVAILABLE": "\u9002\u914D\u5668\u7684\u53EA\u8BFB\u6A21\u5F0F\u5C1A\u4E0D\u53EF\u7528\u6216\u65E0\u6CD5\u9A8C\u8BC1\uFF0C\u672C\u6B21\u4E0D\u4F1A\u53D1\u9001\u4EFB\u52A1\u3002",
  "error.ALREADY_APPROVED": "\u8FD9\u4E2A\u7248\u672C\u5DF2\u7ECF\u6279\u51C6\u3002\u9700\u8981\u4FEE\u6539\u65F6\uFF0C\u8BF7\u5148\u63D0\u51FA\u4FEE\u8BA2\u3002",
  "error.APPROVAL_REQUIRED": "\u8FD9\u9879\u64CD\u4F5C\u9700\u8981\u5B98\u65B9\u5BA1\u6279\u5361\u4E0A\u7684\u660E\u786E\u5141\u8BB8\u3002",
  "error.APPROVAL_STALE": "\u8BA1\u5212\u5728\u5C55\u793A\u540E\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u67E5\u770B\u6700\u65B0\u7248\u672C\u5E76\u91CD\u65B0\u7533\u8BF7\u6279\u51C6\u3002",
  "error.APPROVAL_TAMPERED": "\u5DF2\u6279\u51C6\u5FEB\u7167\u4E0E\u8BB0\u5F55\u4E0D\u7B26\uFF0C\u6267\u884C\u5DF2\u963B\u65AD\u3002\u8BF7\u6838\u5BF9\u8BA1\u5212\u540E\u91CD\u65B0\u6279\u51C6\u3002",
  "error.APPROVAL_INVALID": "\u5DF2\u6279\u51C6\u5FEB\u7167\u7F3A\u5931\u6216\u635F\u574F\uFF0C\u6267\u884C\u5DF2\u963B\u65AD\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u5E76\u6838\u5BF9\u4EFB\u52A1\u3002",
  "error.BINDING_INVALID": "\u672C\u6B21\u64CD\u4F5C\u7684\u8BA1\u5212\u7248\u672C\u4FE1\u606F\u65E0\u6548\u3002\u8BF7\u5148\u8BFB\u53D6\u6700\u65B0\u8BA1\u5212\u72B6\u6001\u3002",
  "error.BINDING_MISMATCH": "\u672C\u6B21\u64CD\u4F5C\u4E0D\u5C5E\u4E8E\u5F53\u524D\u8BA1\u5212\u7248\u672C\u6216\u5DE5\u4F5C\u533A\u3002\u8BF7\u5148\u6838\u5BF9\u6700\u65B0\u8BA1\u5212\u72B6\u6001\u3002",
  "error.BINDING_REQUIRED": "\u672C\u6B21\u64CD\u4F5C\u7F3A\u5C11\u8BA1\u5212\u7248\u672C\u4FE1\u606F\u3002\u8BF7\u5148\u8BFB\u53D6\u6700\u65B0\u8BA1\u5212\u72B6\u6001\u3002",
  "error.CHECKS_MISSING": "\u8BA1\u5212\u6CA1\u6709\u53EF\u6267\u884C\u7684\u9A8C\u6536\u68C0\u67E5\u3002\u8BF7\u8865\u5145\u68C0\u67E5\u540E\u518D\u7533\u8BF7\u6279\u51C6\u3002",
  "error.CLOSED": "\u8FD9\u8F6E\u8BA1\u5212\u5DF2\u7ECF\u5173\u95ED\u3002\u8BF7\u67E5\u770B\u6700\u65B0\u72B6\u6001\u6216\u63D0\u51FA\u65B0\u8BA1\u5212\u3002",
  "error.CONTRACT": "\u8BA1\u5212\u7ED3\u6784\u4E0D\u5B8C\u6574\u6216\u65E0\u6548\u3002\u8BF7\u8BA9\u5F53\u524D\u4F1A\u8BDD\u4FEE\u8BA2\u8BA1\u5212\uFF1B\u539F\u59CB\u8BCA\u65AD\u5728\u8C03\u7528\u8BB0\u5F55\u4E2D\u3002",
  "error.DRAFT_CHANGED": "\u8349\u7A3F\u5DF2\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u67E5\u770B\u8BA1\u5212\u5E76\u7533\u8BF7\u6279\u51C6\u3002",
  "error.LOCK_INVALID": "\u6267\u884C\u9501\u4FE1\u606F\u65E0\u6548\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u6838\u5BF9\u4EFB\u52A1\u72B6\u6001\u540E\u5904\u7406\u6267\u884C\u4E2D\u65AD\u3002",
  "error.LOCK_OWNER": "\u65E0\u6CD5\u786E\u8BA4\u6267\u884C\u9501\u5F52\u5C5E\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u5148\u6838\u5BF9\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u3002",
  "error.REAPPROVAL_REQUIRED": "\u8FD9\u8F6E\u8BA1\u5212\u9700\u8981\u91CD\u65B0\u6279\u51C6\uFF0C\u4E0D\u80FD\u76F4\u63A5\u7EE7\u7EED\u6267\u884C\u3002",
  "error.RECOVERY_REQUIRED": "\u4E0A\u6B21\u64CD\u4F5C\u5F02\u5E38\u4E2D\u65AD\u3002\u8BF7\u5148\u6838\u5BF9\u5DF2\u6709\u6539\u52A8\uFF0C\u518D\u901A\u8FC7\u5B98\u65B9\u5BA1\u6279\u5904\u7406\u4E2D\u65AD\u9501\u3002",
  "error.RECOVERY_TOKEN": "\u4E2D\u65AD\u6062\u590D\u4FE1\u606F\u5DF2\u8FC7\u671F\u6216\u4E0D\u5339\u914D\u3002\u8BF7\u91CD\u65B0\u8BFB\u53D6\u4EFB\u52A1\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u6062\u590D\u3002",
  "error.REVIEW_INVALID": "\u9A8C\u6536\u8BB0\u5F55\u65E0\u6548\uFF0C\u4E0D\u80FD\u8BA4\u5B9A\u901A\u8FC7\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u5E76\u91CD\u65B0\u6838\u5BF9\u8BC1\u636E\u3002",
  "error.REVIEW_LIMIT": "\u672C\u8F6E\u5DF2\u8FBE\u5230\u9A8C\u6536\u5931\u8D25\u4E0A\u9650\u3002\u8BF7\u5148\u786E\u8BA4\u4E0B\u4E00\u6B65\uFF0C\u4E0D\u80FD\u81EA\u52A8\u7EE7\u7EED\u4FEE\u590D\u3002",
  "error.ROUND_INVALID": "\u8BA1\u5212\u8F6E\u6B21\u65E0\u6548\u3002\u8BF7\u8BFB\u53D6\u6700\u65B0\u8BA1\u5212\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  "error.QUESTIONS_OPEN": "\u8BA1\u5212\u8FD8\u6709\u963B\u585E\u95EE\u9898\u3002\u8BF7\u5148\u56DE\u7B54\u95EE\u9898\u5E76\u4FEE\u8BA2\uFF0C\u518D\u7533\u8BF7\u6279\u51C6\u3002",
  "error.STATE_CONFLICT": "\u8BA1\u5212\u72B6\u6001\u5728\u64CD\u4F5C\u671F\u95F4\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u8BFB\u53D6\u72B6\u6001\u540E\u51B3\u5B9A\u4E0B\u4E00\u6B65\u3002",
  "error.STATE_INVALID": "\u8BA1\u5212\u72B6\u6001\u8BB0\u5F55\u65E0\u6548\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u3002",
  "error.STATE_TRANSITION": "\u5F53\u524D\u4EFB\u52A1\u72B6\u6001\u4E0D\u5141\u8BB8\u8FD9\u9879\u64CD\u4F5C\u3002\u8BF7\u5148\u67E5\u770B\u6700\u65B0\u8BA1\u5212\u72B6\u6001\u3002",
  "error.STORAGE_INVALID": "\u8BA1\u5212\u5B58\u50A8\u65E0\u6CD5\u5B89\u5168\u8BFB\u53D6\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u68C0\u67E5\u8DEF\u5F84\u548C\u6587\u4EF6\u72B6\u6001\u3002",
  "error.STORAGE_SIZE": "\u8BA1\u5212\u5B58\u50A8\u5185\u5BB9\u8D85\u8FC7\u9650\u5236\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u5E76\u7F29\u5C0F\u8BA1\u5212\u6216\u8BC1\u636E\u8303\u56F4\u3002",
  "error.TASK_BUSY": "\u5F53\u524D\u8BA1\u5212\u5DF2\u6709\u64CD\u4F5C\u6B63\u5728\u8FD0\u884C\u3002\u8BF7\u67E5\u770B\u73B0\u6709\u4EFB\u52A1\uFF0C\u4E0D\u8981\u91CD\u590D\u542F\u52A8\u3002",
  "error.APPROVAL_DENIED": "\u5B98\u65B9\u5BA1\u6279\u6CA1\u6709\u5141\u8BB8\u8FD9\u9879\u64CD\u4F5C\uFF0C\u8BA1\u5212\u672A\u83B7\u65B0\u7684\u6267\u884C\u6388\u6743\u3002",
  "error.APPROVAL_UNAVAILABLE": "\u65E0\u6CD5\u53D6\u5F97\u5B98\u65B9\u5BA1\u6279\uFF0C\u64CD\u4F5C\u6CA1\u6709\u6267\u884C\u3002\u8BF7\u68C0\u67E5\u5F53\u524D\u4F1A\u8BDD\u7684\u5BA1\u6279\u529F\u80FD\u3002",
  "error.BASELINE_CHANGED": "\u5DE5\u4F5C\u533A\u4E0E\u8BA1\u5212\u57FA\u7EBF\u5DF2\u4E0D\u4E00\u81F4\u3002\u8BF7\u5148\u6838\u5BF9\u53D8\u5316\uFF0C\u518D\u4FEE\u8BA2\u5E76\u91CD\u65B0\u6279\u51C6\u3002",
  "error.BASELINE_INCOMPLETE": "\u65E0\u6CD5\u53D6\u5F97\u5B8C\u6574\u5DE5\u4F5C\u533A\u57FA\u7EBF\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u4E2D\u7684\u5177\u4F53\u7F3A\u5931\u9879\u3002",
  "error.CHECKS_INVALID": "\u9A8C\u6536\u68C0\u67E5\u8BB0\u5F55\u65E0\u6548\uFF0C\u4E0D\u80FD\u636E\u6B64\u8BA4\u5B9A\u901A\u8FC7\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u3002",
  "error.CHECK_CONTEXT": "\u9A8C\u6536\u547D\u4EE4\u4E0E\u5F53\u524D\u5DF2\u6279\u51C6\u4EFB\u52A1\u4E0D\u5339\u914D\uFF0C\u5DF2\u963B\u65AD\u6267\u884C\u3002",
  "error.COMMAND_SCOPE": "\u547D\u4EE4\u4E0D\u5C5E\u4E8E\u5F53\u524D\u6279\u51C6\u8303\u56F4\uFF0C\u5DF2\u963B\u65AD\u6267\u884C\u3002\u8BF7\u6838\u5BF9\u8BA1\u5212\u5E76\u91CD\u65B0\u7533\u8BF7\u5FC5\u8981\u6743\u9650\u3002",
  "error.COMMAND_BACKEND": "\u5F53\u524D\u547D\u4EE4\u540E\u7AEF\u65E0\u6CD5\u63D0\u4F9B\u8981\u6C42\u7684\u524D\u53F0\u6267\u884C\u8BB0\u5F55\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u4F7F\u7528\u652F\u6301\u6807\u51C6\u7ED3\u6784\u5316 bash \u7ED3\u679C\u7684\u5BBF\u4E3B\u540E\u7AEF\u3002",
  "error.SCOPE_UNSUPPORTED": "\u8BA1\u5212\u8303\u56F4\u5305\u542B\u65E0\u6CD5\u5B8C\u6574\u9A8C\u8BC1\u7684\u6587\u4EF6\uFF0C\u5DF2\u963B\u65AD\u64CD\u4F5C\u3002\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u4E2D\u7684\u5177\u4F53\u8DEF\u5F84\u548C\u539F\u56E0\uFF0C\u518D\u8C03\u6574\u8BA1\u5212\u3002",
  "error.JOB_NOT_QUIESCENT": "\u4ECD\u6709\u76F8\u5173\u8FDB\u7A0B\u6B63\u5728\u8FD0\u884C\uFF0C\u6682\u65F6\u4E0D\u80FD\u7ED3\u675F\u9A8C\u6536\u6216\u6062\u590D\u4EFB\u52A1\u3002\u8BF7\u5148\u6838\u5BF9\u8FDB\u7A0B\u72B6\u6001\u3002",
  "error.MULTIPLE_ACTIVE": "\u53D1\u73B0\u591A\u4E2A\u6D3B\u52A8\u8BA1\u5212\uFF0C\u65E0\u6CD5\u5B89\u5168\u786E\u5B9A\u5F53\u524D\u4EFB\u52A1\u3002\u8BF7\u6838\u5BF9\u8BA1\u5212\u72B6\u6001\u3002",
  "error.NO_TASK": "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u8BA1\u5212\u4EFB\u52A1\u3002\u53EF\u4EE5\u5148\u63D0\u51FA\u76EE\u6807\u5E76\u751F\u6210\u8BA1\u5212\u3002",
  "error.PLAN_SIZE": "\u8BA1\u5212\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002\u8BF7\u7F29\u5C0F\u8303\u56F4\u6216\u62C6\u6210\u53EF\u72EC\u7ACB\u9A8C\u6536\u7684\u9636\u6BB5\u3002",
  "error.PLAN_WORKSPACE_CHANGED": "\u751F\u6210\u8BA1\u5212\u671F\u95F4\u5DE5\u4F5C\u533A\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u57FA\u4E8E\u6700\u65B0\u5DE5\u4F5C\u533A\u91CD\u65B0\u89C4\u5212\u3002",
  "error.PREFLIGHT_FAILED": "\u89C4\u5212\u8005\u6216\u9A8C\u6536\u8005\u7684\u9884\u68C0\u672A\u901A\u8FC7\u3002\u8BF7\u68C0\u67E5\u9002\u914D\u5668\u3001\u767B\u5F55\u72B6\u6001\u548C\u53EA\u8BFB\u6A21\u5F0F\u3002",
  "error.RECOVERY_UNSAFE": "\u76EE\u524D\u4E0D\u80FD\u5B89\u5168\u91CA\u653E\u6267\u884C\u9501\u3002\u8BF7\u5148\u6838\u5BF9\u76F8\u5173\u8FDB\u7A0B\uFF0C\u4E0D\u80FD\u76F4\u63A5\u6062\u590D\u6267\u884C\u3002",
  "error.REVIEW_PREFLIGHT": "\u9A8C\u6536\u8005\u9884\u68C0\u672A\u901A\u8FC7\uFF0C\u5C1A\u672A\u5B8C\u6210\u9A8C\u6536\u3002\u8BF7\u4FEE\u590D\u9002\u914D\u5668\u6216\u767B\u5F55\u95EE\u9898\u540E\u518D\u8BD5\u3002",
  "error.REVIEW_STATE": "\u5F53\u524D\u8BA1\u5212\u72B6\u6001\u4E0D\u5141\u8BB8\u9A8C\u6536\u3002\u8BF7\u5148\u8BFB\u53D6\u6700\u65B0\u72B6\u6001\u5E76\u5904\u7406\u5F85\u786E\u8BA4\u4E8B\u9879\u3002",
  "error.SECRET_CONTENT": "\u4EFB\u52A1\u8F93\u5165\u6216\u8F93\u51FA\u53EF\u80FD\u5305\u542B\u51ED\u636E\u6216\u79D8\u5BC6\uFF0C\u76F8\u5173\u5185\u5BB9\u5DF2\u6682\u7F13\u4F20\u9012\u3002\u8BF7\u5728\u672C\u5730\u6838\u5BF9\uFF0C\u53BB\u9664\u654F\u611F\u5185\u5BB9\u540E\u91CD\u8BD5\u3002",
  "error.STORE_BUSY": "\u8BA1\u5212\u8BB0\u5F55\u6B63\u5728\u7531\u53E6\u4E00\u9879\u64CD\u4F5C\u66F4\u65B0\u3002\u8BF7\u7A0D\u540E\u8BFB\u53D6\u6700\u65B0\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u64CD\u4F5C\u3002",
  "error.UNKNOWN": "\u64CD\u4F5C\u672A\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u53C2\u6570\u3001\u6587\u4EF6\u6743\u9650\u6216\u4EE3\u7406\u8FDE\u63A5\u72B6\u6001\uFF1B\u8C03\u7528\u8BB0\u5F55\u4FDD\u7559\u4E86\u539F\u59CB\u8BCA\u65AD\u3002"
};
var en = {
  "tool.dsh_x_plan": "Create a plan",
  "tool.dsh_x_approve_plan": "Approve a plan",
  "tool.dsh_x_discard_plan": "Discard a plan",
  "tool.dsh_x_review": "Review a plan",
  "tool.dsh_x_plan_status": "Read plan status",
  "tool.dsh_x_revise_plan": "Revise a plan",
  "tool.dsh_x_recover_plan": "Resolve an interrupted operation",
  "state.preparing": "Preparing",
  "state.running": "In progress",
  "state.done": "Operation recorded",
  "state.failed": "Not completed",
  "result.plan": "Plan round {round} is saved and awaiting approval.",
  "result.approve": "Plan round {round} is approved.",
  "result.discard": "Plan round {round} is discarded.",
  "result.pass": "Plan round {round} passed review.",
  "result.fail": "Plan round {round} did not pass review.",
  "result.stopped": "Plan round {round} has failed review {count} times. Further reviews have stopped.",
  "plan.notice": "Review the plan first. File changes under the plan remain blocked until approval. Approval uses the plan file\u2019s content at that time.",
  "approve.notice": "Execute only the steps in the approved file.",
  "review.stopped": "Review the existing gaps and agree on next steps with the user before starting a new planning round.",
  "review.missing-verdict": "The review is missing a dsh-x-verdict code block containing only pass or fail.",
  "file.open": "Open result file",
  "file.path": "Result file",
  "inspect": "Inspect call",
  "legacy": "This historical result has no structured display information. Its original record is preserved below.",
  "snapshot": "Historical snapshot of this operation",
  "task.title": "Plan task",
  "task.label": "Plan task: {goal}",
  "task.untitled": "Untitled task",
  "task.version": "Round {round} \xB7 Revision {revision}",
  "task.hash": "Version fingerprint",
  "task.counts": "{files} files \xB7 {steps} steps \xB7 {checks} checks",
  "task.blocking": "{count} questions still need an answer before execution can be approved.",
  "task.review-failed": "Review did not pass",
  "task.questions-open": "Questions need answers",
  "task.inconclusive": "Review evidence is incomplete",
  "task.stopped": "Next step needs confirmation",
  "task.none": "No active task",
  "result.incomplete": "Completion is not verified",
  "workflow.draft": "Awaiting approval",
  "workflow.approved": "Approved",
  "workflow.executing": "Executing when recorded",
  "workflow.reviewing": "Reviewing when recorded",
  "workflow.needs_user": "Needs your decision",
  "workflow.completed": "Review passed",
  "workflow.cancelled": "Discarded",
  "role.planner": "Planner",
  "role.executor": "Executor",
  "role.reviewer": "Reviewer",
  "role.current-session": "Current DSH session",
  "value.unavailable": "Not recorded",
  "files.title": "File scope in this version",
  "files.empty": "No file changes are listed.",
  "steps.title": "Planned steps",
  "questions.title": "Open questions",
  "questions.empty": "This version has no open questions.",
  "question.blocking": "Blocking",
  "question.assumption": "Non-blocking",
  "checks.title": "Verification evidence",
  "checks.summary": "{passed} passed \xB7 {failed} failed \xB7 {inconclusive} inconclusive \xB7 {pending} not run",
  "checks.empty": "No verification checks are recorded.",
  "checks.notice": "Check commands may generate files or have other side effects. Host permissions still apply; this list is not execution approval.",
  "checks.incomplete": "The completion claim lacks complete, consistent passing evidence. Inspect the checks and call record.",
  "check.passed": "Passed",
  "check.failed": "Failed",
  "check.inconclusive": "Inconclusive",
  "check.not-run": "Not run",
  "check.exit": "Exit code {code}",
  "reason.title": "Result details",
  "reason.draft_ready": "The draft is saved. Review it and resolve blocking questions before requesting official approval.",
  "reason.operation_locked": "An operation lock exists and work may still be running. Check its state before attempting recovery.",
  "reason.repository_changed": "The working directory or repository state changed, so execution stopped. Inspect the current repository and existing changes before deciding whether to replan.",
  "reason.review_limit": "This approved revision reached its review failure limit.",
  "reason.review_inconclusive": "The available evidence cannot support a reliable review conclusion.",
  "reason.interrupted_runtime": "The previous runtime was interrupted. Inspect existing changes first.",
  "reason.task_interrupted": "The previous operation was interrupted. Inspect existing changes first.",
  "reason.recovered_interrupted_task": "The interruption was handled. Fresh approval is still required before execution.",
  "reason.legacy_requires_approval": "This older task lacks the new approval evidence. Discard it and create a new plan.",
  "reason.discarded": "The user discarded this task round. Existing file changes remain.",
  "reason.replaced_by_draft": "A newer planning round replaced this draft.",
  "reason.multiple_active_rounds": "Multiple active tasks were found. Inspect them and explicitly discard the extra tasks.",
  "details.plan": "View scope, steps, and checks",
  "details.record": "View version and original record",
  "raw.notice": "The original model or tool text below stays unchanged when the interface language changes.",
  "raw.empty": "No body text was recorded.",
  "next.draft": "Request changes in the current chat, or ask to approve this version. Only Allow on the official approval card authorizes execution.",
  "next.questions": "Answer the blocking questions in the current chat and revise the plan before requesting approval.",
  "next.approved": "The current session may continue within the approved scope; host permissions still apply. To change scope, explicitly discard this task, then create and approve a new plan. Existing changes will remain.",
  "next.executing": "This is the execution state when recorded. Check the current chat or request fresh plan status for the latest progress.",
  "next.reviewing": "This is the review state when recorded. Do not treat the task as passed before checks finish.",
  "next.needs_user": "Inspect the result details. Seek fresh official approval to keep the scope, or explicitly discard this task and replan to change scope. Execution cannot continue automatically.",
  "next.completed": "This version passed the recorded review. Inspect its evidence; committing, pushing, and publishing still require their own authorization.",
  "next.cancelled": "To continue, request a new plan in the current chat.",
  "next.fail": "Have the current session address the gaps within the approved scope and review again. To expand scope, explicitly discard this task, then create and approve a new plan. Existing changes will remain.",
  "next.inconclusive": "Inspect the missing or uncertain evidence, seek fresh official approval, then complete the evidence and review again. This does not mean the implementation failed.",
  "next.unverified": "Ask the current session to reconcile the checks and review record, then update status. Completion is not verified yet.",
  "next.stopped": "This revision reached its review failure limit. Decide whether to approve the same scope again or discard and replan. Fixes cannot continue automatically.",
  "next.recover": "The interrupted-operation lock was handled, but execution will not resume automatically. Inspect existing changes and seek fresh official approval. Discard and replan to change scope.",
  "next.none": "There is no active plan. Describe a goal in the current chat and request a plan.",
  "next.recovered-empty": "The interrupted-operation lock was handled. There is no active plan and no task will run automatically. You can describe a new goal in the current chat.",
  "discard.notice": "Discarding a plan does not undo file changes already made.",
  "error.SESSION_KEY": "The session identifier cannot safely locate a plan directory.",
  "error.DRAFT_EXISTS": "An unfinished plan exists. Read its status first. Only unapproved drafts can be revised; complete or explicitly discard other tasks before planning again.",
  "error.DISCARDED": "This plan round has already been discarded.",
  "error.NOT_APPROVED": "This plan round has not been approved.",
  "error.META_MISSING": "The plan metadata is missing.",
  "error.META_INVALID": "The plan metadata is incomplete.",
  "error.PLAN_MISSING": "The requested plan round was not found.",
  "error.FAMILY": "The planner and reviewer must be codex, claude, or grok.",
  "error.LAUNCH": "The installed ACP command was not found. Check its installation, pinned version, and PATH. The plugin will not download an adapter automatically.",
  "error.ACP_STREAM": "The ACP process did not provide stdin/stdout.",
  "error.ACP_SIZE": "The ACP response exceeds the safe size limit.",
  "error.ACP_SESSION": "The ACP process did not return a session identifier.",
  "error.ACP_AUTH": "The ACP agent requires sign-in. Sign in through its CLI first. This plugin does not save API keys.",
  "error.ACP_CLOSED": "The ACP connection closed. Please try again.",
  "error.ACP_INVALID": "The ACP response is not a valid JSON-RPC message.",
  "error.ACP_REQUEST": "The ACP request did not complete. Check the agent connection.",
  "error.CANCELLED": "Plan operation cancelled.",
  "error.GOAL_EMPTY": "The goal cannot be empty.",
  "error.CONTEXT_SIZE": "Reference material exceeds the size limit. Keep only relevant excerpts.",
  "error.PLAN_FAILED": "Planning did not complete normally. Check the agent and try again.",
  "error.REVIEW_FAILED": "Review did not complete normally. Check the agent and try again.",
  "error.ACCEPTANCE_LENGTH": "An acceptance command exceeds the character limit.",
  "error.ACCEPTANCE_COUNT": "The acceptance command count exceeds the limit.",
  "error.NO_DRAFT": "No plan is awaiting approval.",
  "error.WRONG_ROUND": "The requested round is not the plan currently awaiting approval.",
  "error.NO_DISCARD": "There is no plan to discard.",
  "error.NO_APPROVED": "There is no approved plan.",
  "error.SAME_FAMILY": "The reviewer must use a different model family from the planner.",
  "error.NO_SESSION": "This tool requires a current session, but the call has no session identifier.",
  "error.STATE_READ": "The current plan state could not be read, so tool execution stopped. Check the plan directory and try again.",
  "error.DRAFT_UNAPPROVED": "The current plan is not approved. Ask the user to approve it or discard it first.",
  "error.ACP_CLEANUP": "The external adapter did not stop cleanly. This operation is not complete. Check its CLI process.",
  "error.ACP_PROTOCOL": "The ACP protocol version is incompatible. Check the installed adapter version.",
  "error.ACP_IDENTITY": "The adapter did not provide a complete name and version, so its identity cannot be checked.",
  "error.ACP_IDENTITY_CHANGED": "The adapter executable, name, or version changed after preflight. Check both planner and reviewer again.",
  "error.ACP_MODE": "The required read-only mode could not be maintained. The external task stopped. Check adapter mode support.",
  "error.ACP_MODE_UNSUPPORTED": "The adapter does not support the required read-only mode. No task will be sent. Choose an installed adapter that supports it.",
  "error.READONLY_UNAVAILABLE": "The adapter read-only mode is unavailable or unverified. No task will be sent.",
  "error.ALREADY_APPROVED": "This version is already approved. Request a revision before changing it.",
  "error.APPROVAL_REQUIRED": "This operation needs explicit Allow on the official approval card.",
  "error.APPROVAL_STALE": "The plan changed after it was shown. Review the latest version and request approval again.",
  "error.APPROVAL_TAMPERED": "The approved snapshot no longer matches its record. Execution is blocked. Check the plan and seek approval again.",
  "error.APPROVAL_INVALID": "The approved snapshot is missing or damaged. Execution is blocked. Inspect the call record and task.",
  "error.BINDING_INVALID": "The operation has invalid plan-version details. Read the latest plan status first.",
  "error.BINDING_MISMATCH": "This operation does not match the current plan version or workspace. Check the latest plan status.",
  "error.BINDING_REQUIRED": "This operation is missing its plan-version details. Read the latest plan status first.",
  "error.CHECKS_MISSING": "The plan has no executable verification checks. Add checks before requesting approval.",
  "error.CLOSED": "This plan round is closed. Check the latest state or request a new plan.",
  "error.CONTRACT": "The plan structure is incomplete or invalid. Ask the current session to revise it. The call record contains the original diagnostic.",
  "error.DRAFT_CHANGED": "The draft changed. Review it again before requesting approval.",
  "error.LOCK_INVALID": "The operation lock is invalid. Work is blocked. Check task status before resolving the interruption.",
  "error.LOCK_OWNER": "The operation lock owner cannot be confirmed. Work is blocked. Check the currently running task.",
  "error.REAPPROVAL_REQUIRED": "This plan needs fresh approval before execution can continue.",
  "error.RECOVERY_REQUIRED": "The previous operation was interrupted. Inspect existing changes, then use official approval to handle its lock.",
  "error.RECOVERY_TOKEN": "The recovery details expired or do not match. Read task status again instead of repeating recovery.",
  "error.REVIEW_INVALID": "The review record is invalid and cannot establish a pass. Inspect the call record and verify the evidence.",
  "error.REVIEW_LIMIT": "This round reached its review failure limit. Confirm the next step before more fixes.",
  "error.ROUND_INVALID": "The plan round is invalid. Read the latest plan status before retrying.",
  "error.QUESTIONS_OPEN": "The plan has unanswered blocking questions. Answer them and revise the plan before approval.",
  "error.STATE_CONFLICT": "The plan state changed during this operation. Read it again before choosing the next step.",
  "error.STATE_INVALID": "The plan state record is invalid. Work is blocked. Inspect the call record.",
  "error.STATE_TRANSITION": "This operation is not allowed in the current task state. Read the latest plan status.",
  "error.STORAGE_INVALID": "Plan storage cannot be read safely. Work is blocked. Check its path and file state.",
  "error.STORAGE_SIZE": "The stored plan content exceeds the limit. Inspect the call record and reduce plan or evidence scope.",
  "error.TASK_BUSY": "An operation is already running for this plan. Check it instead of starting a duplicate.",
  "error.APPROVAL_DENIED": "Official approval did not allow this operation. No new execution permission was granted.",
  "error.APPROVAL_UNAVAILABLE": "Official approval is unavailable. The operation did not run. Check approval support in this session.",
  "error.BASELINE_CHANGED": "The workspace no longer matches the plan baseline. Inspect the changes, then revise and seek approval again.",
  "error.BASELINE_INCOMPLETE": "A complete workspace baseline could not be captured. Inspect the call record for the missing evidence.",
  "error.CHECKS_INVALID": "Verification records are invalid and cannot establish a pass. Inspect the call record.",
  "error.CHECK_CONTEXT": "The verification command does not match the current approved task. Execution was blocked.",
  "error.COMMAND_SCOPE": "The command is outside the approved scope and was blocked. Check the plan and request any needed permission.",
  "error.COMMAND_BACKEND": "The command backend cannot provide the required foreground execution record. Work is blocked. Use a host backend that supports standard structured bash results.",
  "error.SCOPE_UNSUPPORTED": "The plan scope includes files that cannot be fully verified. Work is blocked. Inspect the call record for paths and reasons before adjusting the plan.",
  "error.JOB_NOT_QUIESCENT": "A related process is still running. Review or recovery cannot finish yet. Check its state first.",
  "error.MULTIPLE_ACTIVE": "More than one active plan was found, so the current task cannot be selected safely. Inspect plan status.",
  "error.NO_TASK": "This session has no plan task. Describe a goal and create a plan first.",
  "error.PLAN_SIZE": "The plan exceeds the size limit. Narrow its scope or split it into independently verifiable phases.",
  "error.PLAN_WORKSPACE_CHANGED": "The workspace changed while planning. Generate a plan against the latest workspace.",
  "error.PREFLIGHT_FAILED": "Planner or reviewer preflight failed. Check the adapter, existing sign-in, and read-only mode.",
  "error.RECOVERY_UNSAFE": "The operation lock cannot be released safely yet. Check the related process before attempting recovery.",
  "error.REVIEW_PREFLIGHT": "Reviewer preflight failed, so review is incomplete. Resolve adapter or sign-in issues before retrying.",
  "error.REVIEW_STATE": "The current plan state does not allow review. Read its latest state and resolve pending decisions.",
  "error.SECRET_CONTENT": "Task input or output may contain credentials or secrets, so the affected content was withheld. Inspect it locally and remove sensitive content before retrying.",
  "error.STORE_BUSY": "Another operation is updating the plan record. Read its latest state shortly instead of repeating the operation.",
  "error.UNKNOWN": "The operation did not complete. Check the arguments, file permissions, or agent connection. The call record preserves the original diagnostic."
};
function planErrorKey(error) {
  if (["ABORTED", "ABORTED_BEFORE_DISPATCH", "DSH_X_PLAN_CANCELLED"].includes(error?.code)) return "error.CANCELLED";
  if (error?.name !== "DshXPlanError" || !error.code?.startsWith("DSH_X_PLAN_")) return "error.UNKNOWN";
  const key = `error.${error.code.slice("DSH_X_PLAN_".length)}`;
  return Object.hasOwn(en, key) ? key : "error.UNKNOWN";
}

// src/client/presentation.js
function readPresentation(meta) {
  if (!meta || meta.kind !== "dsh-x-plan.result") return null;
  if (meta.version === 2) return readTaskPresentation(meta);
  if (meta.version !== 1 || !["plan", "approve", "discard", "review"].includes(meta.operation) || !Number.isSafeInteger(meta.round) || meta.round < 1 || typeof meta.path !== "string" || typeof meta.body !== "string" || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0 || typeof meta.missingVerdict !== "boolean" || (meta.operation === "review" ? !["pass", "fail", "stopped"].includes(meta.verdict) : meta.verdict !== null)) return null;
  return meta;
}
var WORKFLOW_STATES = ["draft", "approved", "executing", "reviewing", "needs_user", "completed", "cancelled"];
var CHECK_STATES = ["passed", "failed", "inconclusive", "not-run"];
function readTaskPresentation(meta) {
  if (meta.workflowState === "none") return ["status", "recover"].includes(meta.operation) && text(meta.text) ? meta : null;
  if (!["plan", "approve", "discard", "review", "status", "revise", "recover"].includes(meta.operation) || !Number.isSafeInteger(meta.round) || meta.round < 1 || !Number.isSafeInteger(meta.revision) || meta.revision < 1 || typeof meta.hash !== "string" || !/^[a-f0-9]{64}$/i.test(meta.hash) || !text(meta.path) || !text(meta.body) || !text(meta.goal) || !text(meta.planner) || !text(meta.reviewer) || !WORKFLOW_STATES.includes(meta.workflowState) || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0 || ![null, void 0, "pass", "fail", "inconclusive", "stopped"].includes(meta.verdict) || meta.reason !== void 0 && meta.reason !== null && !text(meta.reason) || !list(meta.files, 50, (file) => text(file) && file !== "") || !list(meta.steps, 30, (step) => step && text(step.id) && text(step.title)) || !list(meta.questions, 20, (question) => question && text(question.text) && typeof question.blocking === "boolean") || !list(meta.checks, 8, (check) => check && text(check.id) && text(check.command) && (check.status === void 0 || CHECK_STATES.includes(check.status)) && (check.exitCode === null || check.exitCode === void 0 || Number.isSafeInteger(check.exitCode)))) return null;
  if (meta.checks.some((check) => check.status === void 0)) return { ...meta, checks: meta.checks.map((check) => ({ ...check, status: check.status ?? "not-run", exitCode: check.exitCode ?? null })) };
  return meta;
}
function checkSummary(meta) {
  const counts = Object.fromEntries(CHECK_STATES.map((state) => [state, 0]));
  for (const check of meta.checks) counts[check.status] += 1;
  const allPassed = meta.checks.length > 0 && meta.checks.every((check) => check.status === "passed" && check.exitCode === 0);
  return { counts, allPassed, inconsistentPass: (meta.verdict === "pass" || meta.workflowState === "completed") && (!allPassed || meta.verdict !== "pass") };
}
function taskStatus(meta) {
  if (meta.workflowState === "needs_user" && meta.reason === "review_limit") return { key: "task.stopped", tone: "warning" };
  if (meta.workflowState === "draft" && meta.questions.some((question) => question.blocking)) return { key: "task.questions-open", tone: "warning" };
  if (checkSummary(meta).inconsistentPass) return { key: "result.incomplete", tone: "warning" };
  if (meta.operation === "review" && meta.verdict === "fail") return { key: "task.review-failed", tone: "error" };
  if ((meta.operation === "review" || meta.workflowState === "needs_user") && meta.verdict === "inconclusive") return { key: "task.inconclusive", tone: "warning" };
  if (meta.operation === "review" && meta.verdict === "stopped") return { key: "task.stopped", tone: "warning" };
  if (meta.workflowState === "completed" && ["fail", "inconclusive", "stopped"].includes(meta.verdict)) return { key: "result.incomplete", tone: "warning" };
  const tone = meta.workflowState === "completed" ? "success" : meta.workflowState === "needs_user" ? "warning" : "neutral";
  return { key: `workflow.${meta.workflowState}`, tone };
}
function text(value) {
  return typeof value === "string";
}
function list(value, max, valid) {
  return Array.isArray(value) && value.length <= max && value.every(valid);
}

// src/client/PlanToolRow.jsx
function PlanToolRow({ toolName, phase, block, t, formatCount, openFile, inspect }) {
  const settled = phase === "result";
  const meta = settled && !block.isError ? readPresentation(block.meta) : null;
  if (meta?.version === 2 && meta.workflowState === "none") return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxp-tool dxp-empty", "aria-label": t(`tool.${toolName}`) }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-heading" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t(`tool.${toolName}`)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-status", role: "status" }, t("task.none"))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-snapshot" }, t("snapshot")), /* @__PURE__ */ import_react.default.createElement("p", null, t(meta.operation === "recover" ? "next.recovered-empty" : "next.none")), inspect && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-inspect", onClick: inspect }, t("inspect")));
  if (meta?.version === 2) return /* @__PURE__ */ import_react.default.createElement(TaskCard, { meta, t, formatCount, openFile, inspect });
  const state = !settled ? phase === "preparing" ? "preparing" : "running" : block.isError ? "failed" : "done";
  const resultKey = meta?.operation === "review" ? meta.verdict : meta?.operation;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxp-tool", "aria-label": t(`tool.${toolName}`) }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-heading" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t(`tool.${toolName}`)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-status", role: "status" }, t(`state.${state}`))), settled && block.isError && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxp-error" }, t(planErrorKey(block.error))), meta && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-snapshot" }, t("snapshot")), /* @__PURE__ */ import_react.default.createElement("p", null, t(`result.${resultKey}`, { round: formatCount(meta.round), count: formatCount(meta.attempt) })), meta.operation === "plan" && /* @__PURE__ */ import_react.default.createElement("p", null, t("plan.notice")), meta.operation === "approve" && /* @__PURE__ */ import_react.default.createElement("p", null, t("approve.notice")), meta.operation === "discard" && /* @__PURE__ */ import_react.default.createElement("p", null, t("discard.notice")), meta.verdict === "stopped" && /* @__PURE__ */ import_react.default.createElement("p", null, t("review.stopped")), meta.missingVerdict && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert" }, t("review.missing-verdict")), meta.path && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-path" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("file.path"), ": "), /* @__PURE__ */ import_react.default.createElement("span", null, meta.path), openFile && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => openFile(meta.path) }, t("file.open"))), meta.body && /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-body" }, meta.body)), settled && !block.isError && !meta && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", null, t("legacy")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-body" }, (block.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n"))), inspect && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-inspect", onClick: inspect }, t("inspect")));
}
function TaskCard({ meta, t, formatCount, openFile, inspect }) {
  const status = taskStatus(meta);
  const summary = checkSummary(meta);
  const blockedQuestions = meta.questions.filter((question) => question.blocking).length;
  const hasObservedChecks = meta.checks.some((check) => check.status !== "not-run");
  const nextKey = meta.operation === "recover" ? "next.recover" : status.key === "task.stopped" ? "next.stopped" : meta.workflowState === "draft" && blockedQuestions > 0 ? "next.questions" : status.key === "result.incomplete" ? "next.unverified" : meta.operation === "review" && meta.verdict === "fail" ? "next.fail" : status.key === "task.inconclusive" ? "next.inconclusive" : `next.${meta.workflowState}`;
  const knownReasons = ["draft_ready", "operation_locked", "repository_changed", "review_limit", "review_inconclusive", "interrupted_runtime", "task_interrupted", "recovered_interrupted_task", "legacy_requires_approval", "discarded", "replaced_by_draft", "multiple_active_rounds"];
  const reason = knownReasons.includes(meta.reason) ? t(`reason.${meta.reason}`) : meta.reason;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxp-tool dxp-task", "data-plan-state": meta.workflowState, "aria-label": t("task.label", { goal: meta.goal }) }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-heading" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-title" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-eyebrow" }, t("task.title")), /* @__PURE__ */ import_react.default.createElement("strong", null, meta.goal || t("task.untitled"))), /* @__PURE__ */ import_react.default.createElement("span", { className: `dxp-status dxp-${status.tone}`, role: "status" }, t(status.key))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-meta" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("task.version", { round: formatCount(meta.round), revision: formatCount(meta.revision) })), /* @__PURE__ */ import_react.default.createElement("span", null, t("snapshot"))), /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxp-roles" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("dt", null, t("role.planner")), /* @__PURE__ */ import_react.default.createElement("dd", null, meta.planner || t("value.unavailable"))), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("dt", null, t("role.executor")), /* @__PURE__ */ import_react.default.createElement("dd", null, t("role.current-session"))), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("dt", null, t("role.reviewer")), /* @__PURE__ */ import_react.default.createElement("dd", null, meta.reviewer || t("value.unavailable")))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-counts" }, t("task.counts", { files: formatCount(meta.files.length), steps: formatCount(meta.steps.length), checks: formatCount(meta.checks.length) })), blockedQuestions > 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-warning" }, t("task.blocking", { count: formatCount(blockedQuestions) })), (hasObservedChecks || ["review", "status"].includes(meta.operation)) && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-evidence", "aria-label": t("checks.title") }, /* @__PURE__ */ import_react.default.createElement("strong", null, t("checks.title")), meta.checks.length ? /* @__PURE__ */ import_react.default.createElement("p", null, t("checks.summary", { passed: formatCount(summary.counts.passed), failed: formatCount(summary.counts.failed), inconclusive: formatCount(summary.counts.inconclusive), pending: formatCount(summary.counts["not-run"]) })) : /* @__PURE__ */ import_react.default.createElement("p", null, t("checks.empty"))), status.key === "result.incomplete" && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxp-warning" }, t("checks.incomplete")), reason && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-reason" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t("reason.title")), /* @__PURE__ */ import_react.default.createElement("p", null, reason)), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-next" }, t(nextKey)), meta.workflowState === "cancelled" && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-warning" }, t("discard.notice")), /* @__PURE__ */ import_react.default.createElement("details", { className: "dxp-details" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("details.plan")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-detail-content" }, /* @__PURE__ */ import_react.default.createElement("section", null, /* @__PURE__ */ import_react.default.createElement("h4", null, t("files.title")), meta.files.length ? /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxp-file-list" }, meta.files.map((file, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: `${index}:${file}` }, file))) : /* @__PURE__ */ import_react.default.createElement("p", null, t("files.empty"))), /* @__PURE__ */ import_react.default.createElement("section", null, /* @__PURE__ */ import_react.default.createElement("h4", null, t("steps.title")), /* @__PURE__ */ import_react.default.createElement("ol", null, meta.steps.map((step, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: `${index}:${step.id}` }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-item-id" }, step.id), step.title)))), /* @__PURE__ */ import_react.default.createElement("section", null, /* @__PURE__ */ import_react.default.createElement("h4", null, t("questions.title")), meta.questions.length ? /* @__PURE__ */ import_react.default.createElement("ul", null, meta.questions.map((question, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: index }, /* @__PURE__ */ import_react.default.createElement("span", { className: `dxp-tag ${question.blocking ? "dxp-warning" : ""}` }, t(question.blocking ? "question.blocking" : "question.assumption")), question.text))) : /* @__PURE__ */ import_react.default.createElement("p", null, t("questions.empty"))), /* @__PURE__ */ import_react.default.createElement("section", null, /* @__PURE__ */ import_react.default.createElement("h4", null, t("checks.title")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-muted" }, t("checks.notice")), meta.checks.length ? /* @__PURE__ */ import_react.default.createElement("ol", { className: "dxp-checks" }, meta.checks.map((check, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: `${index}:${check.id}` }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-check-heading" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-item-id" }, check.id), /* @__PURE__ */ import_react.default.createElement("span", { className: `dxp-check-state dxp-check-${check.status}` }, t(`check.${check.status}`)), Number.isSafeInteger(check.exitCode) && /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-muted" }, t("check.exit", { code: formatCount(check.exitCode) }))), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-command" }, check.command)))) : /* @__PURE__ */ import_react.default.createElement("p", null, t("checks.empty"))))), /* @__PURE__ */ import_react.default.createElement("details", { className: "dxp-details dxp-technical" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("details.record")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-detail-content" }, /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxp-record" }, /* @__PURE__ */ import_react.default.createElement("dt", null, t("file.path")), /* @__PURE__ */ import_react.default.createElement("dd", null, meta.path || t("value.unavailable")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("task.hash")), /* @__PURE__ */ import_react.default.createElement("dd", null, meta.hash)), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-muted" }, t("raw.notice")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-body" }, meta.body || t("raw.empty")))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-actions" }, meta.path && openFile && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => openFile(meta.path) }, t("file.open")), inspect && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-inspect", onClick: inspect }, t("inspect"))));
}

// src/client/index.js
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "plan: dictionaries");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-plan";
    style.textContent = `
.dxp-tool{box-sizing:border-box;max-width:100%;min-width:0;padding:14px;color:var(--dsw-alias-label-primary,#202124);font:13px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}
.dxp-tool *{box-sizing:border-box;min-width:0}.dxp-tool p{margin:8px 0}.dxp-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.dxp-title{display:grid;gap:3px;flex:1 1 180px}.dxp-title strong{font-size:15px;line-height:1.4}.dxp-eyebrow,.dxp-muted,.dxp-meta,.dxp-snapshot{color:var(--dsw-alias-label-secondary,#62666d);font-size:12px}.dxp-eyebrow{font-weight:500}.dxp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px}
.dxp-status{display:inline-flex;align-items:center;max-width:100%;border:1px solid var(--dsw-alias-border-l2,#d8dadd);border-radius:6px;padding:3px 8px;font-size:12px;font-weight:600;line-height:1.4;background:var(--dsw-alias-bg-layer-2,#f4f5f6)}
.dxp-success{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16734c) 60%,var(--dsw-alias-label-primary,#202124))}.dxp-error,.dxp-check-failed{color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b3293d) 60%,var(--dsw-alias-label-primary,#202124))}.dxp-warning,.dxp-check-inconclusive{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#865600) 60%,var(--dsw-alias-label-primary,#202124))}
.dxp-roles{display:flex;flex-wrap:wrap;gap:8px 22px;margin:14px 0 8px}.dxp-roles>div{display:flex;gap:7px;align-items:baseline}.dxp-roles dt{color:var(--dsw-alias-label-secondary,#62666d);font-size:12px}.dxp-roles dd{margin:0;font-weight:500}.dxp-counts{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#62666d)}
.dxp-next{padding:10px 12px;border-inline-start:3px solid var(--dsw-alias-border-l2,#d8dadd);background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-radius:0 6px 6px 0}.dxp-evidence,.dxp-reason{margin-top:12px}.dxp-evidence strong,.dxp-reason strong{font-size:12px}.dxp-evidence p,.dxp-reason p{margin:4px 0;white-space:pre-wrap}
.dxp-details{border-top:1px solid var(--dsw-alias-border-l2,#dedfe2);margin-top:10px}.dxp-details>summary{padding:11px 0;cursor:pointer;font-weight:600;list-style-position:inside}.dxp-technical>summary{font-weight:400;color:var(--dsw-alias-label-secondary,#62666d)}.dxp-detail-content{padding:0 0 8px}.dxp-detail-content h4{margin:12px 0 6px;font-size:13px}.dxp-detail-content ol,.dxp-detail-content ul{margin:6px 0;padding-inline-start:22px}.dxp-detail-content li{padding:3px 0}.dxp-item-id{color:var(--dsw-alias-label-secondary,#62666d);margin-inline-end:8px;font-size:12px}.dxp-tag{display:inline-block;border:1px solid var(--dsw-alias-border-l2,#dedfe2);border-radius:4px;font-size:11px;margin-inline-end:7px;padding:0 5px}.dxp-checks{list-style:none;padding:0!important}.dxp-checks li{padding:9px 0}.dxp-check-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.dxp-check-state{font-weight:600}.dxp-check-passed{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16734c) 60%,var(--dsw-alias-label-primary,#202124))}
.dxp-body,.dxp-command{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:inherit;margin:8px 0;max-height:360px;overflow:auto}.dxp-command{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-radius:6px;padding:8px 10px;max-height:180px}.dxp-record{display:grid;grid-template-columns:minmax(70px,auto) minmax(0,1fr);gap:8px;margin:8px 0;font-size:12px}.dxp-record dt{color:var(--dsw-alias-label-secondary,#62666d)}.dxp-record dd{margin:0;overflow-wrap:anywhere}.dxp-path{overflow-wrap:anywhere}
.dxp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.dxp-tool button{max-width:100%;color:inherit;font:inherit;border:1px solid var(--dsw-alias-border-l2,#cfd2d6);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);padding:6px 10px;cursor:pointer;white-space:normal;text-align:start}.dxp-tool button:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f6)}.dxp-tool button:focus-visible,.dxp-details>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:3px}.dxp-path button{margin:6px}.dxp-tool>.dxp-inspect{margin-top:10px}
@media(max-width:420px){.dxp-tool{padding:10px}.dxp-record{grid-template-columns:1fr;gap:3px}.dxp-record dd{margin-bottom:8px}.dxp-roles{gap:6px 14px}}
`;
    document.head.appendChild(style);
    return () => style.remove();
  }, "plan: styles");
  const formatCount = (value) => {
    const locale = ctx.locale.getLocale().active;
    const tag = locale === "zh" ? "zh-CN" : locale;
    return new Intl.NumberFormat(Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? "en", { maximumFractionDigits: 0 }).format(value);
  };
  for (const key of ["dsh_x_plan", "dsh_x_approve_plan", "dsh_x_discard_plan", "dsh_x_review", "dsh_x_plan_status", "dsh_x_revise_plan", "dsh_x_recover_plan"]) {
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key, locale: NS, inject: () => ({ formatCount }) }, PlanToolRow));
  }
}
return module.exports; } });
