<template>
  <div class="system-config">
    <a-card :bordered="false" class="config-card">
      <template #title>
        <span>系统设置</span>
      </template>

      <div class="config-content">
        <a-form :model="form" layout="vertical" class="config-form">
          <a-divider orientation="left">安全设置</a-divider>

          <a-form-item label="后台密码">
            <a-input-password
              v-model="form.admin_password"
              placeholder="修改后台登录密码"
              allow-clear
            />
            <template #extra>
              <span class="form-tip">留空表示不修改</span>
            </template>
          </a-form-item>

          <a-form-item label="代理接口Token">
            <a-input
              v-model="form.proxy_token"
              placeholder="留空则不验证Token"
              allow-clear
            />
            <template #extra>
              <span class="form-tip"
                >设置后，调用/proxy/get接口时需要携带此Token</span
              >
            </template>
          </a-form-item>

          <a-form-item label="IP白名单">
            <a-select
              v-model="form.ip_whitelist"
              multiple
              allow-create
              allow-search
              placeholder="输入IP后回车添加"
            />
            <template #extra>
              <span class="form-tip"
                >只有白名单中的IP才能调用代理接口，留空则不限制。支持通配符，如:
                192.168.*.*</span
              >
            </template>
          </a-form-item>

          <a-divider orientation="left">代理设置</a-divider>

          <a-form-item label="最大失败次数">
            <a-input-number
              v-model="form.max_fail_count"
              :min="1"
              :max="10"
              style="width: 150px"
            />
            <template #extra>
              <span class="form-tip">账号连续提取失败超过此次数后自动禁用</span>
            </template>
          </a-form-item>

          <a-form-item label="失败关键词">
            <a-select
              v-model="form.proxy_failure_keywords"
              multiple
              allow-create
              allow-search
              placeholder="输入关键词后回车添加"
            />
            <template #extra>
              <span class="form-tip"
                >当提取响应包含这些关键词时，视为失败并切换账号</span
              >
            </template>
          </a-form-item>

          <a-divider orientation="left">定时任务</a-divider>

          <a-form-item label="余额查询间隔">
            <div class="inline-input">
              <a-input-number
                v-model="form.balance_check_interval"
                :min="1"
                :max="1440"
                style="width: 150px"
              />
              <span class="input-suffix">分钟</span>
            </div>
            <template #extra>
              <span class="form-tip">定时查询所有账号余额的间隔时间</span>
            </template>
          </a-form-item>

          <a-form-item label="代理白名单保活">
            <a-switch
              v-model="form.proxy_keepalive_enabled"
              :checked-value="1"
              :unchecked-value="0"
            />
            <template #extra>
              <span class="form-tip">启用后定期为长期未提取IP的账号执行一次提取并通过该IP访问目标网站</span>
            </template>
          </a-form-item>

          <a-form-item label="保活检测间隔">
            <div class="inline-input">
              <a-input-number
                v-model="form.proxy_keepalive_interval_days"
                :min="1"
                :max="365"
                style="width: 150px"
              />
              <span class="input-suffix">天</span>
            </div>
            <template #extra>
              <span class="form-tip">默认 7 天；超过该天数没有成功提取记录的账号会触发保活</span>
            </template>
          </a-form-item>

          <a-form-item label="保活执行时间">
            <div class="inline-input">
              <a-input-number
                v-model="form.proxy_keepalive_check_hour"
                :min="0"
                :max="23"
                style="width: 100px"
              />
              <span class="input-suffix">时</span>
              <a-input-number
                v-model="form.proxy_keepalive_check_minute"
                :min="0"
                :max="59"
                style="width: 100px"
              />
              <span class="input-suffix">分</span>
            </div>
            <template #extra>
              <span class="form-tip">每天到点检查一次，距离上次保活不足检测间隔时会自动跳过</span>
            </template>
          </a-form-item>

          <a-form-item label="保活访问地址">
            <a-input
              v-model="form.proxy_keepalive_target_url"
              placeholder="http://example.com"
              style="max-width: 420px"
            />
            <template #extra>
              <span class="form-tip">保活任务会使用提取到的代理IP访问该HTTP/HTTPS地址；日志备注可搜索“代理白名单保活”查看</span>
            </template>
          </a-form-item>

          <div class="form-actions">
            <a-button type="primary" :loading="saving" @click="handleSave"
              >保存设置</a-button
            >
          </div>
        </a-form>
      </div>

      <a-spin :loading="loading" dot />
    </a-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { getConfig, updateConfig } from "@/api/config";
import { Message } from "@arco-design/web-vue";

const loading = ref(false);
const saving = ref(false);

const form = reactive({
  admin_password: "",
  proxy_token: "",
  ip_whitelist: [],
  max_fail_count: 3,
  proxy_failure_keywords: ["余额不足", "已过期"],
  balance_check_interval: 30,
  proxy_keepalive_enabled: 1,
  proxy_keepalive_interval_days: 7,
  proxy_keepalive_check_hour: 3,
  proxy_keepalive_check_minute: 20,
  proxy_keepalive_target_url: "http://example.com",
});

const loadConfig = async () => {
  loading.value = true;
  try {
    const res = await getConfig();
    const configs = res.data || [];
    configs.forEach((item) => {
      if (item.key === "admin_password") {
        form.admin_password = "";
      } else if (item.key === "proxy_token") {
        form.proxy_token = item.value || "";
      } else if (item.key === "ip_whitelist") {
        try {
          form.ip_whitelist = JSON.parse(item.value || "[]");
        } catch {
          form.ip_whitelist = [];
        }
      } else if (item.key === "max_fail_count") {
        form.max_fail_count = parseInt(item.value, 10) || 3;
      } else if (item.key === "proxy_failure_keywords") {
        try {
          form.proxy_failure_keywords = JSON.parse(
            item.value || '["余额不足", "已过期"]'
          );
        } catch {
          form.proxy_failure_keywords = ["余额不足", "已过期"];
        }
      } else if (item.key === "balance_check_interval") {
        form.balance_check_interval = parseInt(item.value, 10) || 30;
      } else if (item.key === "proxy_keepalive_enabled") {
        form.proxy_keepalive_enabled = item.value === "0" ? 0 : 1;
      } else if (item.key === "proxy_keepalive_interval_days") {
        form.proxy_keepalive_interval_days = parseInt(item.value, 10) || 7;
      } else if (item.key === "proxy_keepalive_check_hour") {
        form.proxy_keepalive_check_hour = parseInt(item.value, 10) || 0;
      } else if (item.key === "proxy_keepalive_check_minute") {
        form.proxy_keepalive_check_minute = parseInt(item.value, 10) || 0;
      } else if (item.key === "proxy_keepalive_target_url") {
        form.proxy_keepalive_target_url = item.value || "http://example.com";
      }
    });
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  saving.value = true;
  try {
    const configs = [];

    if (form.admin_password && form.admin_password !== "******") {
      configs.push({ key: "admin_password", value: form.admin_password });
    }

    configs.push({ key: "proxy_token", value: form.proxy_token || "" });
    configs.push({
      key: "ip_whitelist",
      value: JSON.stringify(form.ip_whitelist),
    });
    configs.push({
      key: "max_fail_count",
      value: form.max_fail_count.toString(),
    });
    configs.push({
      key: "proxy_failure_keywords",
      value: JSON.stringify(form.proxy_failure_keywords),
    });
    configs.push({
      key: "balance_check_interval",
      value: form.balance_check_interval.toString(),
    });
    configs.push({
      key: "proxy_keepalive_enabled",
      value: form.proxy_keepalive_enabled.toString(),
    });
    configs.push({
      key: "proxy_keepalive_interval_days",
      value: form.proxy_keepalive_interval_days.toString(),
    });
    configs.push({
      key: "proxy_keepalive_check_hour",
      value: form.proxy_keepalive_check_hour.toString(),
    });
    configs.push({
      key: "proxy_keepalive_check_minute",
      value: form.proxy_keepalive_check_minute.toString(),
    });
    configs.push({
      key: "proxy_keepalive_target_url",
      value: form.proxy_keepalive_target_url || "http://example.com",
    });

    await updateConfig(configs);
    Message.success("保存成功");
    form.admin_password = "";
  } catch (error) {
    // 错误已处理
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.system-config {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  margin: 0;
}

.config-card :deep(.arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px; /* 给滚动条留点空间 */
  margin-right: -8px; /* 抵消padding的影响 */
}

/* 自定义滚动条样式 */
.config-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.config-content::-webkit-scrollbar-track {
  background: var(--color-fill-2);
  border-radius: 3px;
}

.config-content::-webkit-scrollbar-thumb {
  background: var(--color-fill-4);
  border-radius: 3px;
}

.config-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-fill-5);
}

.config-form {
  max-width: 600px;
  padding-bottom: 20px; /* 底部留点空间 */
}

.form-tip {
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 1.5;
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-suffix {
  color: var(--color-text-2);
  white-space: nowrap;
}

.form-actions {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-2); /* 确保背景色一致 */
  position: sticky;
  bottom: 0;
  /* 添加一点点阴影效果，让视觉上更舒服 */
  box-shadow: 0 -4px 8px -4px rgba(0, 0, 0, 0.05);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .config-form {
    max-width: 100%;
  }

  .inline-input {
    flex-wrap: wrap;
  }

  .config-content {
    padding-right: 4px;
    margin-right: -4px;
  }

  .form-actions {
    padding: 12px 0 8px;
  }
}
</style>
