# 接口设计与契约规范（API Specification）

**项目名称：** 听序（Tingxu）  
**文档版本：** v0.2  
**最后更新：** 2026-10-30  
**适用范围：** 控制面 HTTP RESTful 接口、AI Gateway 调度接口、WebSocket 流式协议与微信支付回调  

---

## 1. 通用设计规范

### 1.1 协议与基础路径
- **通信协议**：生产环境强制采用 `HTTPS`（TLS 1.3）与 `WSS`。
- **控制面 Base URL**：`https://api.tingxu.cn/v1`
- **AI Gateway Base URL**：`https://gateway.tingxu.cn/v1`
- **公共请求头**：
  ```http
  Authorization: Bearer <jwt_access_token>
  X-Client-Platform: MACOS | WINDOWS
  X-Client-Version: 0.2.0
  X-Device-Id: <hardware_device_fingerprint>
  Content-Type: application/json
  ```

### 1.2 统一响应报文格式
所有控制面 HTTP API 均采用统一的 JSON 包装：

```json
{
  "code": 0,                     // 0 表示业务成功；非 0 为具体错误码
  "message": "success",          // 人类可读提示（中文）
  "data": { ... },               // 具体业务负载
  "requestId": "req_88f9a12c",   // 全局唯一排查追踪 ID
  "timestamp": 1730300000000
}
```

### 1.3 标准业务错误码表

| 错误码 (Code) | HTTP 状态码 | 业务语义与处理指引 |
| :--- | :---: | :--- |
| `0` | 200 | 请求成功 |
| `10001` | 400 | 请求参数校验不通过（携带具体 DTO 校验详情） |
| `10002` | 429 | 短信发送频控拦截（请在 60 秒后重试） |
| `20001` | 401 | 身份鉴权失败（Token 过期或签名无效） |
| `20002` | 403 | 权限不足（如非所有者尝试审批运营赠送单） |
| `30001` | 402 | **时长配额不足**（当前可用会议时长已耗尽，请升级套餐） |
| `30002` | 409 | 任务并发超限（单账号同一时间最多开启 1 场录音任务） |
| `40001` | 502 | ASR 供应商网络波动或连接超时 |
| `40002` | 504 | 大模型调用超时（已触发自建网关多模型熔断互备） |

---

## 2. 身份与账户模块接口

### 2.1 发送手机短信验证码
- **接口路径**：`POST /auth/sms/send`
- **请求负载**：
  ```json
  {
    "phone": "13800138000"
  }
  ```
- **成功响应**：
  ```json
  {
    "code": 0,
    "message": "验证码发送成功",
    "data": {
      "expireSeconds": 300
    }
  }
  ```

### 2.2 验证码登录 / 注册
- **接口路径**：`POST /auth/sms/verify`
- **请求负载**：
  ```json
  {
    "phone": "13800138000",
    "code": "123456",
    "platform": "MACOS",
    "deviceFingerprint": "dev_mac_m3_xxxxxx"
  }
  ```
- **成功响应**：
  ```json
  {
    "code": 0,
    "message": "登录成功",
    "data": {
      "accessToken": "eyJhbGciOi...",
      "expiresIn": 604800,
      "user": {
        "id": "usr_9a8b7c6d",
        "phoneMasked": "138****8000"
      }
    }
  }
  ```

### 2.3 获取本人权益与套餐状态
- **接口路径**：`GET /me/entitlements`
- **成功响应**：
  ```json
  {
    "code": 0,
    "message": "success",
    "data": {
      "availableDurationSeconds": 7200,   // 剩余可用时长：120 分钟
      "currentPlan": {
        "planId": "plan_pro_monthly",
        "title": "专业版包月套餐",
        "expiresAt": "2026-11-30T23:59:59Z",
        "includedFeatures": [
          "LIVE_INSIGHTS",
          "MEETING_CHAT",
          "FINAL_SUMMARY",
          "ACTION_EXTRACTION"
        ]
      }
    }
  }
  ```

---

## 3. 任务编排与 AI Gateway 契约

### 3.1 创建处理任务并预占时长
- **接口路径**：`POST /jobs/authorize`
- **请求负载**：
  ```json
  {
    "taskType": "LIVE_RECORDING",
    "estimatedSeconds": 3600,             // 本次开会预估时长（默认 1 小时）
    "idempotencyKey": "job_local_uuid_xxxx"
  }
  ```
- **成功响应**：
  ```json
  {
    "code": 0,
    "message": "任务授权成功",
    "data": {
      "taskId": "task_20261030_xxxx",
      "reservationId": "res_887766",
      "asrCredentials": {
        "mode": "DIRECT_WSS",             // 或 IN_MEMORY_RELAY（依据 ADR-001 结果）
        "wssEndpoint": "wss://tingxu-asr.cn-hangzhou.aliyuncs.com/ws/v1",
        "tempToken": "sts_token_xxxxx",
        "expiresAt": 1730303600
      }
    }
  }
  ```

### 3.2 任务时长结算与释放
- **结算接口**：`POST /jobs/{taskId}/settle`
  ```json
  {
    "reservationId": "res_887766",
    "actualSeconds": 2450                 // 实际消耗会议时长
  }
  ```
- **释放接口**：`POST /jobs/{taskId}/cancel`
  ```json
  {
    "reservationId": "res_887766",
    "reason": "USER_ABORTED_OR_NETWORK_ERROR"
  }
  ```

### 3.3 会中结构化增量整理（AI Gateway SSE 接口）
- **接口路径**：`POST /gateway/v1/live-insights`
- **请求头**：`Accept: text/event-stream`
- **请求负载**：
  ```json
  {
    "meetingId": "meet_local_uuid",
    "currentTopicSummary": "讨论 M1 阶段双轨录音落盘技术方案",
    "newStableText": "研发团队表示 WASAPI 原生采集已调通，接下来重点做断电崩溃恢复。",
    "contextAnchors": [
      { "segmentId": "seg_01", "quote": "我们必须保证本地录音绝对不丢。" }
    ]
  }
  ```
- **流式返回格式 (SSE Event Stream)**：
  ```http
  event: insight_patch
  data: {
    "action": "UPDATE_TOPIC",
    "topicId": "topic_01",
    "patch": {
      "title": "M1 双轨音频采集与落盘方案",
      "status": "IN_PROGRESS",
      "decisions": [
        "确认 WASAPI 原生采集方案调通",
        "下一步核心攻关断电崩溃恢复机制"
      ],
      "evidenceRefs": [
        { "segmentId": "seg_02", "startMs": 45000, "quote": "WASAPI 原生采集已调通" }
      ]
    }
  }

  event: done
  data: { "tokensUsed": 420, "modelVersion": "deepseek-v3" }
  ```

### 3.4 会中本场问答接口
- **接口路径**：`POST /gateway/v1/meeting-chat`
- **请求负载**：
  ```json
  {
    "meetingId": "meet_local_uuid",
    "question": "刚才关于测试排期有什么定论吗？",
    "asOfTextVersion": 14,
    "localStableTranscript": [
      { "segmentId": "seg_10", "speaker": "我", "text": "测试排期定在什么时候？" },
      { "segmentId": "seg_11", "speaker": "对方", "text": "这块目前还没排，等下周一确认。" }
    ]
  }
  ```
- **成功响应**：
  ```json
  {
    "code": 0,
    "data": {
      "answer": "根据当前讨论，测试排期目前尚未敲定，参会方表示需等下周一再行确认。",
      "evidenceRefs": [
        { "segmentId": "seg_11", "quote": "这块目前还没排，等下周一确认。" }
      ]
    }
  }
  ```

---

## 4. 商业与微信支付接口

### 4.1 创建购买套餐订单
- **接口路径**：`POST /orders`
- **请求负载**：
  ```json
  {
    "planId": "plan_pro_monthly",
    "couponId": null
  }
  ```
- **成功响应**：
  ```json
  {
    "code": 0,
    "data": {
      "orderNo": "TX20261030123456",
      "actualPriceCents": 3900,           // 39.00 元
      "codeUrl": "weixin://wxpay/bizpayurl?pr=xxxxxx" // 渲染为客户端二维码
    }
  }
  ```

### 4.2 微信支付官方结果异步通知回调
- **接口路径**：`POST /payments/wechat/notify`
- **通信特征**：由微信支付服务器直接发起，携带签名 Header：`Wechatpay-Signature`、`Wechatpay-Timestamp`、`Wechatpay-Nonce`。
- **返回规范**：成功返回 HTTP 200 及 `{"code": "SUCCESS", "message": "OK"}`。

---

## 5. 运营管理后台接口（Admin API）

### 5.1 提交时长补偿申请
- **接口路径**：`POST /admin/adjustments`
- **请求负载**：
  ```json
  {
    "targetPhone": "13800138000",
    "grantType": "DURATION_MINUTES",
    "grantValue": 120,                    // 赠送 120 分钟
    "reason": "由于网络抖动导致上场会议 ASR 重试，给予体验补偿",
    "idempotencyKey": "adj_20261030_001"
  }
  ```

### 5.2 所有者审批并发放
- **接口路径**：`POST /admin/adjustments/{id}/approve`
- **鉴权要求**：操作人身份必须为 `OWNER`。
- **成功响应**：
  ```json
  {
    "code": 0,
    "message": "审批通过，时长已成功发放到账",
    "data": {
      "adjustmentId": "adj_xxxx",
      "status": "APPROVED",
      "grantedBucketId": "bkt_xxxx"
    }
  }
  ```
