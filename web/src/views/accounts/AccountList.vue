<template>
  <div class="account-list">
    <a-card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <a-button type="primary" @click="handleAdd">
          <template #icon><icon-plus /></template>
          <span class="btn-text">添加账号</span>
        </a-button>
        <a-button @click="handleRefreshAllBalance" :loading="refreshing">
          <span class="btn-text">刷新所有余额</span>
        </a-button>
        <a-select
          v-model="filters.siteId"
          placeholder="选择网站"
          allow-clear
          class="filter-select-auto"
          @change="loadData"
        >
          <a-option
            v-for="site in siteOptions"
            :key="site.id"
            :label="site.name"
            :value="site.id"
          />
        </a-select>
        <a-select
          v-model="filters.status"
          placeholder="状态"
          allow-clear
          class="filter-select-auto"
          @change="loadData"
        >
          <a-option label="全部" value="" />
          <a-option label="启用" :value="1" />
          <a-option label="禁用" :value="0" />
        </a-select>
        <a-input
          v-model="filters.name"
          placeholder="搜索账号名称"
          allow-clear
          class="filter-input"
          @press-enter="loadData"
        />
      </div>

      <!-- 桌面端表格 -->
      <div v-if="!isMobile" class="table-wrapper" ref="tableWrapperRef">
        <a-table
          :data="tableData"
          :loading="loading"
          :pagination="false"
          :bordered="{ wrapper: true }"
          :scroll="{ y: tableScrollY }"
          style="width: 100%"
        >
          <template #columns>
            <a-table-column
              title="ID"
              data-index="id"
              :width="70"
              align="center"
            />
            <a-table-column
              title="账号名称"
              data-index="name"
              :min-width="120"
              align="center"
            >
              <template #cell="{ record }">
                <a-tooltip v-if="record.name" :content="record.name">
                  <span>{{ formatAccountName(record.name) }}</span>
                </a-tooltip>
                <span v-else>-</span>
              </template>
            </a-table-column>
            <a-table-column title="所属网站" :width="120" align="center">
              <template #cell="{ record }">
                <template v-if="record.site">
                  {{ record.site.name }}
                </template>
                <a-tag v-else color="orangered" size="small">独立包月</a-tag>
              </template>
            </a-table-column>
            <a-table-column
              title="余额"
              data-index="balance"
              :width="100"
              align="center"
            >
              <template #cell="{ record }">
                <template v-if="isMonthlyAccount(record)">
                  <a-tag color="gray" size="small">包月</a-tag>
                </template>
                <template v-else>
                  <span
                    :class="{ 'low-balance': Number(record.balance) < 10 }"
                    >{{ Number(record.balance || 0).toFixed(2) }}</span
                  >
                </template>
              </template>
            </a-table-column>
            <a-table-column
              title="到期时间"
              data-index="expireAt"
              :width="90"
              align="center"
            >
              <template #cell="{ record }">
                <template v-if="record.expireAt">
                  <a-tooltip :content="formatFullDateTime(record.expireAt)">
                    <span
                      class="compact-time"
                      :class="{ expired: isExpired(record.expireAt) }"
                    >
                      {{ formatMonthDay(record.expireAt) }}
                    </span>
                  </a-tooltip>
                </template>
                <span v-else>-</span>
              </template>
            </a-table-column>
            <a-table-column
              title="成功"
              data-index="successCount"
              :width="80"
              align="center"
            >
              <template #cell="{ record }">
                <a-tooltip :content="`成功次数: ${record.successCount || 0}`">
                  <span class="success-count">{{
                    formatCount(record.successCount || 0)
                  }}</span>
                </a-tooltip>
              </template>
            </a-table-column>
            <a-table-column
              title="失败"
              data-index="failCount"
              :width="70"
              align="center"
            >
              <template #cell="{ record }">
                <a-tag
                  :color="
                    record.failCount >= 3
                      ? 'red'
                      : record.failCount > 0
                      ? 'orangered'
                      : 'green'
                  "
                  size="small"
                >
                  {{ record.failCount }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column
              title="余额更新"
              data-index="balanceUpdatedAt"
              :width="100"
              align="center"
            >
              <template #cell="{ record }">
                <template v-if="record.balanceUpdatedAt">
                  <a-tooltip :content="formatFullDateTime(record.balanceUpdatedAt)">
                    <span class="compact-time">
                      {{ formatTimeOnly(record.balanceUpdatedAt) }}
                    </span>
                  </a-tooltip>
                </template>
                <span v-else>-</span>
              </template>
            </a-table-column>
            <a-table-column
              title="状态"
              data-index="status"
              :width="80"
              align="center"
            >
              <template #cell="{ record }">
                <a-tag
                  :color="record.status === 1 ? 'green' : 'red'"
                  size="small"
                >
                  {{ record.status === 1 ? "启用" : "禁用" }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column
              title="创建时间"
              data-index="createdAt"
              :width="170"
              align="center"
            >
              <template #cell="{ record }">
                {{ formatDate(record.created_at) }}
              </template>
            </a-table-column>
            <a-table-column
              title="操作"
              :width="340"
              fixed="right"
              align="center"
            >
              <template #cell="{ record }">
                <a-space>
                  <a-link @click="handleEdit(record)">编辑</a-link>
                  <a-link
                    status="normal"
                    @click="handleTestAccount(record)"
                    :loading="record.testing"
                    >测试</a-link
                  >
                  <a-link
                    v-if="isMonthlyAccount(record)"
                    status="normal"
                    @click="handleUsageLimit(record)"
                    >限制</a-link
                  >
                  <a-link
                    v-if="!isMonthlyAccount(record)"
                    status="success"
                    @click="handleRefreshBalance(record)"
                    :loading="record.refreshing"
                    >刷新余额</a-link
                  >
                  <a-link
                    :status="record.status === 1 ? 'warning' : 'success'"
                    @click="handleToggleStatus(record)"
                    >{{ record.status === 1 ? "禁用" : "启用" }}</a-link
                  >
                  <a-link status="danger" @click="handleDelete(record)"
                    >删除</a-link
                  >
                </a-space>
              </template>
            </a-table-column>
          </template>
        </a-table>
      </div>

      <!-- 移动端卡片列表 -->
      <div v-if="isMobile" class="mobile-card-wrapper">
        <a-spin :loading="loading" style="width: 100%">
          <div class="mobile-card-list">
            <div v-for="item in tableData" :key="item.id" class="mobile-card">
            <div class="card-header">
              <span class="card-title">{{ item.name }}</span>
              <a-tag :color="item.status === 1 ? 'green' : 'red'" size="small">
                {{ item.status === 1 ? "启用" : "禁用" }}
              </a-tag>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">ID:</span>
                <span class="card-value">{{ item.id }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">所属网站:</span>
                <template v-if="item.site">
                  <span class="card-value">{{ item.site.name }}</span>
                </template>
                <a-tag v-else color="orangered" size="small">独立包月</a-tag>
              </div>
              <div class="card-row">
                <span class="card-label">余额:</span>
                <template v-if="isMonthlyAccount(item)">
                  <a-tag color="gray" size="small">包月</a-tag>
                </template>
                <template v-else>
                  <span :class="{ 'low-balance': Number(item.balance) < 10 }">{{
                    Number(item.balance || 0).toFixed(2)
                  }}</span>
                </template>
              </div>
              <div class="card-row" v-if="item.expireAt">
                <span class="card-label">到期时间:</span>
                <span
                  class="card-value clickable-time"
                  :class="{ expired: isExpired(item.expireAt) }"
                  @click="showTimeDetail(item.expireAt, '到期时间')"
                  >{{ formatMonthDay(item.expireAt) }}</span
                >
              </div>
              <div class="card-row">
                <span class="card-label">成功:</span>
                <span class="card-value">{{
                  formatCount(item.successCount || 0)
                }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">失败次数:</span>
                <a-tag
                  :color="
                    item.failCount >= 3
                      ? 'red'
                      : item.failCount > 0
                      ? 'orangered'
                      : 'green'
                  "
                  size="small"
                >
                  {{ item.failCount }}
                </a-tag>
              </div>
              <div class="card-row">
                <span class="card-label">更新时间:</span>
                <span
                  class="card-value"
                  :class="{ 'clickable-time': item.balanceUpdatedAt }"
                  @click="showTimeDetail(item.balanceUpdatedAt, '余额更新时间')"
                  >{{ formatTimeOnly(item.balanceUpdatedAt) }}</span
                >
              </div>
            </div>
            <div class="card-actions">
              <a-button type="primary" size="small" @click="handleEdit(item)"
                >编辑</a-button
              >
              <a-button
                status="normal"
                size="small"
                @click="handleTestAccount(item)"
                :loading="item.testing"
              >
                测试
              </a-button>
              <a-button
                v-if="isMonthlyAccount(item)"
                status="normal"
                size="small"
                @click="handleUsageLimit(item)"
              >
                限制
              </a-button>
              <a-button
                v-if="!isMonthlyAccount(item)"
                status="success"
                size="small"
                @click="handleRefreshBalance(item)"
                :loading="item.refreshing"
              >
                刷新
              </a-button>
              <a-button
                :type="item.status === 1 ? 'warning' : 'success'"
                size="small"
                @click="handleToggleStatus(item)"
              >
                {{ item.status === 1 ? "禁用" : "启用" }}
              </a-button>
              <a-button status="danger" size="small" @click="handleDelete(item)"
                >删除</a-button
              >
            </div>
          </div>
          <a-empty
            v-if="!loading && tableData.length === 0"
            description="暂无数据"
          />
          </div>
        </a-spin>
      </div>

      <!-- 分页 -->
      <div class="pagination">
        <a-pagination
          v-model:current="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-size-options="[10, 20, 50, 100]"
          :show-total="true"
          :show-jumper="!isMobile"
          :show-page-size="!isMobile"
          :simple="isMobile"
          @change="loadData"
          @page-size-change="loadData"
        />
      </div>
    </a-card>

    <!-- 编辑对话框 -->
    <a-modal
      v-model:visible="dialog.visible"
      :title="dialog.isEdit ? '编辑账号' : '添加账号'"
      :width="isMobile ? '95%' : 600"
      :unmount-on-close="true"
      @cancel="dialog.visible = false"
      @ok="handleSubmit"
      :confirm-loading="dialog.loading"
      :mask-closable="false"
    >
      <a-form
        :model="dialog.form"
        :rules="dialog.rules"
        ref="formRef"
        layout="vertical"
      >
        <a-form-item label="账号类型">
          <a-radio-group
            v-model="dialog.form.accountType"
            type="button"
            @change="handleAccountTypeChange"
          >
            <a-radio value="site">关联网站</a-radio>
            <a-radio value="monthly">独立包月</a-radio>
          </a-radio-group>
          <template #extra>
            <span class="form-tip"
              >独立包月账号无需关联网站，可自定义提取链接模板和参数</span
            >
          </template>
        </a-form-item>

        <a-form-item
          v-if="dialog.form.accountType === 'site'"
          label="所属网站"
          field="siteId"
          required
        >
          <a-select
            v-model="dialog.form.siteId"
            placeholder="请选择网站"
            :disabled="dialog.isEdit"
            @change="handleSiteChange"
          >
            <a-option
              v-for="site in siteOptions"
              :key="site.id"
              :label="site.name"
              :value="site.id"
            />
          </a-select>
        </a-form-item>

        <a-form-item label="账号名称" field="name">
          <a-input v-model="dialog.form.name" placeholder="账号备注名称" />
        </a-form-item>

        <!-- 独立包月账号配置 -->
        <template v-if="dialog.form.accountType === 'monthly'">
          <a-divider>提取链接配置</a-divider>

          <a-form-item label="提取链接模板" field="extractUrlTemplate">
            <a-textarea
              v-model="dialog.form.extractUrlTemplate"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              placeholder="支持变量: {times}, {format}, {params.xxx}"
            />
            <template #extra>
              <span class="form-tip"
                >示例:
                https://api.example.com/get?num=1&amp;format={format}&amp;minute={times}&amp;no={params.no}</span
              >
            </template>
          </a-form-item>

          <a-form-item label="格式参数">
            <div class="param-group">
              <div
                v-for="(item, index) in dialog.form.formatParams"
                :key="index"
                class="param-row"
              >
                <a-input
                  v-model="item.label"
                  placeholder="显示名称"
                  class="param-input"
                />
                <a-input
                  v-model="item.value"
                  placeholder="参数值"
                  class="param-input"
                />
                <a-input
                  v-model="item.oValue"
                  placeholder="实际转发值(o_value)"
                  class="param-input"
                />
                <a-button
                  type="text"
                  status="danger"
                  size="small"
                  @click="dialog.form.formatParams.splice(index, 1)"
                >
                  <template #icon><icon-delete /></template>
                </a-button>
              </div>
              <a-button
                type="dashed"
                long
                @click="dialog.form.formatParams.push({ label: '', value: '', oValue: '' })"
              >
                <template #icon><icon-plus /></template>
                添加格式参数
              </a-button>
            </div>
          </a-form-item>

          <a-form-item label="时长参数">
            <div class="param-group">
              <div
                v-for="(item, index) in dialog.form.durationParams"
                :key="index"
                class="param-row"
              >
                <a-input
                  v-model="item.label"
                  placeholder="显示名称"
                  class="param-input-sm"
                />
                <a-input-number
                  v-model="item.times"
                  placeholder="分钟"
                  class="param-input-sm"
                  :min="1"
                />
                <span class="param-unit">分钟</span>
                <a-input
                  v-model="item.oValue"
                  placeholder="实际转发值(o_value)"
                  class="param-input"
                />
                <a-button
                  type="text"
                  status="danger"
                  size="small"
                  @click="dialog.form.durationParams.splice(index, 1)"
                >
                  <template #icon><icon-delete /></template>
                </a-button>
              </div>
              <a-button
                type="dashed"
                long
                @click="
                  dialog.form.durationParams.push({
                    label: '',
                    times: undefined,
                    oValue: '',
                  })
                "
              >
                <template #icon><icon-plus /></template>
                添加时长参数
              </a-button>
            </div>
            <template #extra>
              <span class="form-tip">实际转发值可选，用于将请求的分钟数转换为供应商API所需的实际值</span>
            </template>
          </a-form-item>

          <a-form-item label="失败关键词">
            <a-select
              v-model="dialog.form.failureKeywords"
              multiple
              allow-create
              allow-clear
              placeholder="输入关键词后回车添加"
            />
            <template #extra>
              <span class="form-tip"
                >当提取响应包含这些关键词时，自动切换到下一个账号</span
              >
            </template>
          </a-form-item>
        </template>

        <!-- 智能参数提示（关联网站时显示） -->
        <template
          v-if="
            dialog.form.accountType === 'site' &&
            paramHints.extractParams.length > 0
          "
        >
          <a-divider>提取参数</a-divider>
          <a-alert type="info" style="margin-bottom: 16px">
            请填写以下参数，这些参数会替换到提取链接模板中
          </a-alert>
          <a-form-item
            v-for="param in paramHints.extractParams"
            :key="param"
            :label="param"
          >
            <a-input
              v-model="dialog.form.extractParamValues[param]"
              :placeholder="`请输入 ${param}`"
              @input="syncExtractParams"
            />
          </a-form-item>
        </template>

        <template
          v-if="
            dialog.form.accountType === 'site' &&
            paramHints.balanceParams.length > 0
          "
        >
          <a-divider>余额查询参数</a-divider>
          <a-alert type="info" style="margin-bottom: 16px">
            请填写以下参数，这些参数会替换到余额查询接口中
          </a-alert>
          <a-form-item
            v-for="param in paramHints.balanceParams"
            :key="param"
            :label="param"
          >
            <a-input
              v-model="dialog.form.balanceParamValues[param]"
              :placeholder="`请输入 ${param}`"
              @input="syncBalanceParams"
            />
          </a-form-item>
        </template>

        <!-- 时长参数提示（关联网站时显示） -->
        <template
          v-if="
            dialog.form.accountType === 'site' &&
            paramHints.durationParams.length > 0
          "
        >
          <a-divider>可用时长</a-divider>
          <div class="duration-tags">
            <a-tag
              v-for="item in paramHints.durationParams"
              :key="item.times"
              color="arcoblue"
            >
              {{ item.label }} ({{ item.times }}分钟)
            </a-tag>
          </div>
          <div class="form-tip" style="margin-bottom: 16px">
            调用代理接口时使用 times 参数选择对应时长
          </div>
        </template>

        <a-divider>高级设置</a-divider>

        <a-form-item label="到期时间">
          <a-date-picker
            v-model="dialog.form.expireAt"
            show-time
            format="YYYY-MM-DD HH:mm:ss"
            placeholder="选择到期时间（包月账号专用）"
            style="width: 100%"
          />
          <template #extra>
            <span class="form-tip"
              >设置后，在该时间之前账号视为包月账号，不会被自动禁用</span
            >
          </template>
        </a-form-item>

        <a-form-item label="提取参数">
          <a-textarea
            v-model="dialog.form.extractParamsStr"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="JSON格式，可手动编辑"
          />
          <template #extra>
            <span class="form-tip"
              >上方填写的参数会自动同步到这里，也可以直接编辑JSON</span
            >
          </template>
        </a-form-item>

        <a-form-item label="余额参数">
          <a-textarea
            v-model="dialog.form.balanceParamsStr"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="JSON格式，可手动编辑"
          />
        </a-form-item>

        <a-form-item label="状态">
          <a-radio-group v-model="dialog.form.status" type="button">
            <a-radio :value="1">启用</a-radio>
            <a-radio :value="0">禁用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 账号测试结果 -->
    <a-modal
      v-model:visible="testDialog.visible"
      title="账号测试结果"
      :width="isMobile ? '95%' : 560"
      :footer="false"
    >
      <a-descriptions :column="1" bordered size="small">
        <a-descriptions-item label="账号">
          {{ testDialog.data.accountName || "-" }}
        </a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag :color="testDialog.data.success ? 'green' : 'red'">
            {{ testDialog.data.success ? "正常" : "异常" }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="阶段">
          {{ getTestStageLabel(testDialog.data.stage) }}
        </a-descriptions-item>
        <a-descriptions-item label="结果">
          {{ testDialog.data.message || "-" }}
        </a-descriptions-item>
        <a-descriptions-item label="代理IP">
          {{ testDialog.data.proxy || "-" }}
        </a-descriptions-item>
        <a-descriptions-item label="访问地址">
          {{ testDialog.data.targetUrl || "-" }}
        </a-descriptions-item>
        <a-descriptions-item label="日志ID">
          {{ testDialog.data.logId || "-" }}
        </a-descriptions-item>
      </a-descriptions>
      <div class="test-dialog-tip">
        测试会真实提取一次IP，并用该IP访问系统设置里的“保活访问地址”。可在日志中搜索“账号手动测试”查看详情。
      </div>
    </a-modal>

    <!-- 使用限制对话框 -->
    <a-modal
      v-model:visible="usageLimitDialog.visible"
      title="使用次数限制"
      :width="isMobile ? '95%' : 500"
      :unmount-on-close="true"
      @cancel="usageLimitDialog.visible = false"
      @ok="handleUsageLimitSubmit"
      :confirm-loading="usageLimitDialog.loading"
      :mask-closable="false"
    >
      <a-form :model="usageLimitDialog.form" layout="vertical">
        <a-alert type="info" style="margin-bottom: 16px">
          为包月账号设置使用次数限制，达到限制后自动禁用账号，周期结束后自动解禁
        </a-alert>

        <a-form-item label="限制类型" required>
          <a-radio-group v-model="usageLimitDialog.form.limitType" type="button">
            <a-radio value="daily">每天</a-radio>
            <a-radio value="weekly">每周</a-radio>
            <a-radio value="monthly">每月</a-radio>
            <a-radio value="custom">自定义</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item
          v-if="usageLimitDialog.form.limitType === 'custom'"
          label="自定义天数"
          required
        >
          <a-input-number
            v-model="usageLimitDialog.form.limitDays"
            :min="1"
            :max="365"
            placeholder="输入天数"
            style="width: 100%"
          />
        </a-form-item>

        <a-form-item label="每周期最大次数" required>
          <a-input-number
            v-model="usageLimitDialog.form.limitCount"
            :min="1"
            placeholder="输入最大次数"
            style="width: 100%"
          />
        </a-form-item>

        <a-form-item label="重置时间点">
          <a-time-picker
            v-model="usageLimitDialog.form.resetTimeValue"
            format="HH:mm:ss"
            style="width: 100%"
          />
          <template #extra>
            <span class="form-tip">默认0点重置，可设置为其他时间点如8点</span>
          </template>
        </a-form-item>

        <a-divider v-if="usageLimitDialog.currentLimit">当前状态</a-divider>

        <template v-if="usageLimitDialog.currentLimit">
          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item label="当前已使用">
              {{ usageLimitDialog.currentLimit.currentCount || 0 }} 次
            </a-descriptions-item>
            <a-descriptions-item label="剩余次数">
              {{ Math.max(0, (usageLimitDialog.currentLimit.limitCount || 0) - (usageLimitDialog.currentLimit.currentCount || 0)) }} 次
            </a-descriptions-item>
            <a-descriptions-item label="周期开始">
              {{ formatLimitDate(usageLimitDialog.currentLimit.periodStart) }}
            </a-descriptions-item>
            <a-descriptions-item label="下次重置">
              {{ formatLimitDate(usageLimitDialog.currentLimit.periodEnd) }}
            </a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="usageLimitDialog.currentLimit.isLimited ? 'red' : 'green'">
                {{ usageLimitDialog.currentLimit.isLimited ? '已禁用' : '正常' }}
              </a-tag>
            </a-descriptions-item>
          </a-descriptions>

          <div style="margin-top: 16px">
            <a-button type="outline" @click="handleResetUsageCount" :loading="usageLimitDialog.resetting">
              手动重置计数
            </a-button>
            <a-button
              type="outline"
              status="danger"
              style="margin-left: 8px"
              @click="handleRemoveUsageLimit"
              :loading="usageLimitDialog.removing"
            >
              删除限制
            </a-button>
          </div>
        </template>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from "vue";
import {
  getAccountList,
  getAccountDetail,
  createAccount,
  updateAccount,
  deleteAccount,
  toggleAccountStatus,
  refreshAccountBalance,
  refreshAllBalance,
  testAccount,
} from "@/api/account";
import { getAllActiveSites, getSiteParamHints } from "@/api/site";
import {
  getUsageLimit,
  setUsageLimit,
  removeUsageLimit,
  resetUsageCount,
} from "@/api/usageLimit";
import {
  formatDateTimeForApi,
  formatLocalizedDateTime,
  parseLocalDateTime,
} from "@/utils/date";
import { Message, Modal } from "@arco-design/web-vue";
import { IconPlus, IconDelete } from "@arco-design/web-vue/es/icon";

const loading = ref(false);
const refreshing = ref(false);
const tableData = ref([]);
const siteOptions = ref([]);
const formRef = ref(null);
const tableWrapperRef = ref(null);
const tableScrollY = ref(300);

// 响应式检测
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

// 计算表格滚动高度
const calcTableHeight = () => {
  if (tableWrapperRef.value) {
    const wrapperHeight = tableWrapperRef.value.clientHeight;
    tableScrollY.value = wrapperHeight - 50;
  }
};

const filters = reactive({
  siteId: "",
  status: "",
  name: "",
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

// 参数提示
const paramHints = reactive({
  extractParams: [],
  balanceParams: [],
  durationParams: [],
  formatParams: [],
});

const dialog = reactive({
  visible: false,
  isEdit: false,
  loading: false,
  form: {
    accountType: "site", // site 或 monthly
    siteId: "",
    name: "",
    extractUrlTemplate: "",
    formatParams: [],
    durationParams: [],
    failureKeywords: [],
    extractParamValues: {},
    balanceParamValues: {},
    extractParamsStr: "",
    balanceParamsStr: "",
    expireAt: null,
    status: 1,
  },
  rules: {
    siteId: [
      {
        required: true,
        message: "请选择网站",
        trigger: "change",
        validator: (value, callback) => {
          if (dialog.form.accountType === "site" && !value) {
            callback("请选择网站");
          } else {
            callback();
          }
        },
      },
    ],
  },
});

// 使用限制对话框
const usageLimitDialog = reactive({
  visible: false,
  loading: false,
  resetting: false,
  removing: false,
  accountId: null,
  accountName: "",
  currentLimit: null,
  form: {
    limitType: "daily",
    limitCount: 1000,
    limitDays: 1,
    resetTimeValue: "00:00:00",
  },
});

const testDialog = reactive({
  visible: false,
  data: {},
});

const formatDate = (date) => formatLocalizedDateTime(date);

const formatFullDateTime = (date) => formatDate(date) || "-";

const formatMonthDay = (date) => {
  const parsedDate = parseLocalDateTime(date);
  if (!parsedDate) return "-";

  return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`;
};

const formatTimeOnly = (date) => {
  const parsedDate = parseLocalDateTime(date);
  if (!parsedDate) return "-";

  const hour = String(parsedDate.getHours()).padStart(2, "0");
  const minute = String(parsedDate.getMinutes()).padStart(2, "0");
  const second = String(parsedDate.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
};

const showTimeDetail = (date, title) => {
  if (!date) return;

  Modal.info({
    title,
    content: formatFullDateTime(date),
  });
};

// 格式化成功次数显示
const formatCount = (count) => {
  if (count === 0) return "0";
  if (count < 1000) return count.toString();
  if (count < 10000) return (count / 1000).toFixed(2) + "k";
  if (count < 100000) return (count / 10000).toFixed(2) + "w";
  if (count < 100000000) return Math.floor(count / 10000) + "w";
  return "1亿+";
};

// 账号名显示：前三后二，中间用...代替
const formatAccountName = (name) => {
  if (!name) return "-";
  if (name.length <= 5) return name;
  return name.slice(0, 3) + "..." + name.slice(-2);
};

const isExpired = (date) => {
  const expireDate = parseLocalDateTime(date);
  if (!expireDate) return false;

  return expireDate.getTime() <= Date.now();
};

// 判断是否为包月账号
const isMonthlyAccount = (row) => {
  // 独立包月账号（没有关联网站）
  if (!row.siteId && row.extractUrlTemplate) {
    return true;
  }
  // 网站类型为包月
  if (row.site && row.site.balanceType === "monthly") {
    return true;
  }
  // 账号设置了到期时间且未过期
  const expireDate = parseLocalDateTime(row.expireAt);
  if (expireDate && expireDate.getTime() > Date.now()) {
    return true;
  }
  return false;
};

// 判断是否为独立包月账号
const isStandaloneMonthly = (row) => {
  return !row.siteId && row.extractUrlTemplate;
};

const getTestStageLabel = (stage) => {
  const stageMap = {
    load_account: "读取账号",
    resolve_duration: "解析时长",
    extract: "提取IP",
    parse_proxy: "解析代理",
    visit_target: "访问网站",
    unknown: "未知阶段",
  };

  return stageMap[stage] || stage || "-";
};

const loadSites = async () => {
  try {
    const res = await getAllActiveSites();
    siteOptions.value = res.data;
  } catch (error) {
    // 错误已处理
  }
};

const loadData = async () => {
  loading.value = true;
  try {
    const res = await getAccountList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      siteId: filters.siteId,
      status: filters.status,
      name: filters.name,
    });
    tableData.value = res.data.list.map((item) => ({
      ...item,
      refreshing: false,
    }));
    pagination.total = res.data.total;
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false;
  }
};

// 加载网站参数提示
const handleSiteChange = async (siteId) => {
  // 重置参数
  paramHints.extractParams = [];
  paramHints.balanceParams = [];
  paramHints.durationParams = [];
  paramHints.formatParams = [];
  dialog.form.extractParamValues = {};
  dialog.form.balanceParamValues = {};
  dialog.form.extractParamsStr = "";
  dialog.form.balanceParamsStr = "";

  if (!siteId) {
    return;
  }

  try {
    const res = await getSiteParamHints(siteId);

    paramHints.extractParams = res.data.extractParams || [];
    paramHints.balanceParams = res.data.balanceParams || [];
    paramHints.durationParams = res.data.durationParams || [];
    paramHints.formatParams = res.data.formatParams || [];

    // 初始化参数值对象
    const extractValues = {};
    const balanceValues = {};
    paramHints.extractParams.forEach((p) => {
      extractValues[p] = "";
    });
    paramHints.balanceParams.forEach((p) => {
      balanceValues[p] = "";
    });
    dialog.form.extractParamValues = extractValues;
    dialog.form.balanceParamValues = balanceValues;
  } catch (error) {
    console.error("获取参数提示失败:", error);
    // 错误已处理
  }
};

// 同步提取参数到JSON
const syncExtractParams = () => {
  const params = {};
  Object.entries(dialog.form.extractParamValues).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  dialog.form.extractParamsStr =
    Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : "";
};

// 同步余额参数到JSON
const syncBalanceParams = () => {
  const params = {};
  Object.entries(dialog.form.balanceParamValues).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  dialog.form.balanceParamsStr =
    Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : "";
};

const createDefaultFormatParams = () => [
  { label: "纯IP", value: "txt", oValue: "" },
  { label: "JSON", value: "json", oValue: "" },
];

const normalizeFormatParams = (formatParams = []) => {
  if (!Array.isArray(formatParams)) {
    return [];
  }

  return formatParams.map((item) => ({
    label: item?.label || "",
    value: item?.value || "",
    oValue: item?.oValue ?? item?.o_value ?? "",
  }));
};

const buildFormatParamsPayload = (formatParams = []) => {
  if (!Array.isArray(formatParams)) {
    return [];
  }

  return formatParams
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      const oValue = String(item?.oValue ?? item?.o_value ?? "").trim();

      if (!value) {
        return null;
      }

      const payload = { label, value };
      if (oValue) {
        payload.o_value = oValue;
      }

      return payload;
    })
    .filter(Boolean);
};

const normalizeDurationParams = (durationParams = []) => {
  if (!Array.isArray(durationParams)) {
    return [];
  }

  return durationParams.map((item) => ({
    label: item?.label || "",
    times: item?.times ?? undefined,
    oValue: item?.oValue ?? item?.o_value ?? "",
  }));
};

const buildDurationParamsPayload = (durationParams = []) => {
  if (!Array.isArray(durationParams)) {
    return [];
  }

  return durationParams
    .map((item) => {
      const label = String(item?.label || "").trim();
      const times = parseInt(item?.times, 10);
      const oValue = String(item?.oValue ?? item?.o_value ?? "").trim();

      if (Number.isNaN(times)) {
        return null;
      }

      const payload = { label, times };
      if (oValue) {
        payload.o_value = oValue;
      }

      return payload;
    })
    .filter(Boolean);
};

const resetForm = () => {
  dialog.form = {
    accountType: "site",
    siteId: "",
    name: "",
    extractUrlTemplate: "",
    formatParams: [
      { label: "纯IP", value: "txt" },
      { label: "JSON", value: "JSON" },
    ],
    durationParams: [],
    failureKeywords: [],
    extractParamValues: {},
    balanceParamValues: {},
    extractParamsStr: "",
    balanceParamsStr: "",
    expireAt: null,
    status: 1,
  };
  dialog.form.formatParams = createDefaultFormatParams();
  paramHints.extractParams = [];
  paramHints.balanceParams = [];
  paramHints.durationParams = [];
  paramHints.formatParams = [];
};

// 处理账号类型变更
const handleAccountTypeChange = (type) => {
  if (type === "monthly") {
    dialog.form.siteId = "";
    paramHints.extractParams = [];
    paramHints.balanceParams = [];
    paramHints.durationParams = [];
    paramHints.formatParams = [];
  }
};

const handleAdd = () => {
  resetForm();
  dialog.isEdit = false;
  dialog.visible = true;
};

const handleEdit = async (row) => {
  try {
    const res = await getAccountDetail(row.id);
    const data = res.data;

    // 判断账号类型
    const isMonthly = !data.siteId && data.extractUrlTemplate;

    // 加载参数提示（仅关联网站时）
    if (data.siteId) {
      await handleSiteChange(data.siteId);
    }

    // 解析现有参数
    let extractParams = {};
    let balanceParams = {};
    if (data.extractParams) {
      try {
        extractParams =
          typeof data.extractParams === "string"
            ? JSON.parse(data.extractParams)
            : data.extractParams;
      } catch {}
    }
    if (data.balanceParams) {
      try {
        balanceParams =
          typeof data.balanceParams === "string"
            ? JSON.parse(data.balanceParams)
            : data.balanceParams;
      } catch {}
    }

    dialog.form = {
      accountType: isMonthly ? "monthly" : "site",
      siteId: data.siteId || "",
      name: data.name || "",
      extractUrlTemplate: data.extractUrlTemplate || "",
      formatParams: data.formatParams || [],
      durationParams: data.durationParams || [],
      failureKeywords: data.failureKeywords || [],
      extractParamValues: { ...extractParams },
      balanceParamValues: { ...balanceParams },
      extractParamsStr: data.extractParams
        ? JSON.stringify(extractParams, null, 2)
        : "",
      balanceParamsStr: data.balanceParams
        ? JSON.stringify(balanceParams, null, 2)
        : "",
      expireAt: parseLocalDateTime(data.expireAt),
      status: data.status,
    };
    dialog.form.formatParams = normalizeFormatParams(data.formatParams);
    dialog.form.durationParams = normalizeDurationParams(data.durationParams);
    dialog.isEdit = true;
    dialog.editId = data.id;
    dialog.visible = true;
  } catch (error) {
    // 错误已处理
  }
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  const valid = await formRef.value.validate();
  if (valid) {
    return;
  }

  dialog.loading = true;
  try {
    const data = {
      name: dialog.form.name,
      expireAt: formatDateTimeForApi(dialog.form.expireAt),
      status: dialog.form.status,
    };

    // 根据账号类型设置不同字段
    if (dialog.form.accountType === "monthly") {
      // 独立包月账号
      data.siteId = null;
      data.extractUrlTemplate = dialog.form.extractUrlTemplate || null;
      const formatParams = buildFormatParamsPayload(dialog.form.formatParams);
      data.formatParams = formatParams.length > 0 ? formatParams : null;
      const durationParams = buildDurationParamsPayload(dialog.form.durationParams);
      data.durationParams = durationParams.length > 0 ? durationParams : null;
      data.failureKeywords =
        dialog.form.failureKeywords.length > 0
          ? dialog.form.failureKeywords
          : null;
      // 提取参数
      if (dialog.form.extractParamsStr && dialog.form.extractParamsStr.trim()) {
        try {
          data.extractParams = JSON.parse(dialog.form.extractParamsStr);
        } catch {
          Message.error("提取参数JSON格式错误");
          return;
        }
      } else {
        const params = {};
        Object.entries(dialog.form.extractParamValues).forEach(
          ([key, value]) => {
            if (value) params[key] = value;
          }
        );
        data.extractParams = Object.keys(params).length > 0 ? params : null;
      }
    } else {
      // 关联网站的账号
      data.siteId = dialog.form.siteId;
      data.extractUrlTemplate = null;
      data.formatParams = null;
      data.durationParams = null;
      data.failureKeywords = null;

      // 优先使用JSON字符串，如果为空则从参数值构建
      if (dialog.form.extractParamsStr && dialog.form.extractParamsStr.trim()) {
        try {
          data.extractParams = JSON.parse(dialog.form.extractParamsStr);
        } catch {
          Message.error("提取参数JSON格式错误");
          return;
        }
      } else {
        const params = {};
        Object.entries(dialog.form.extractParamValues).forEach(
          ([key, value]) => {
            if (value) params[key] = value;
          }
        );
        data.extractParams = Object.keys(params).length > 0 ? params : null;
      }

      if (dialog.form.balanceParamsStr && dialog.form.balanceParamsStr.trim()) {
        try {
          data.balanceParams = JSON.parse(dialog.form.balanceParamsStr);
        } catch {
          Message.error("余额参数JSON格式错误");
          return;
        }
      } else {
        const params = {};
        Object.entries(dialog.form.balanceParamValues).forEach(
          ([key, value]) => {
            if (value) params[key] = value;
          }
        );
        data.balanceParams = Object.keys(params).length > 0 ? params : null;
      }
    }

    if (dialog.isEdit) {
      await updateAccount(dialog.editId, data);
      Message.success("更新成功");
    } else {
      await createAccount(data);
      Message.success("创建成功");
    }
    dialog.visible = false;
    loadData();
  } catch (error) {
    // 错误已处理
  } finally {
    dialog.loading = false;
  }
};

const handleToggleStatus = async (row) => {
  try {
    await toggleAccountStatus(row.id);
    Message.success("状态更新成功");
    loadData();
  } catch (error) {
    // 错误已处理
  }
};

const handleDelete = (row) => {
  Modal.confirm({
    title: "提示",
    content: "确定要删除该账号吗？",
    okText: "确定",
    cancelText: "取消",
    onOk: async () => {
      try {
        await deleteAccount(row.id);
        Message.success("删除成功");
        loadData();
      } catch (error) {
        // 错误已处理
      }
    },
  });
};

const handleRefreshBalance = async (row) => {
  row.refreshing = true;
  try {
    const res = await refreshAccountBalance(row.id);
    if (res.success) {
      Message.success(`余额刷新成功: ${res.data.balance}`);
      loadData();
    }
  } catch (error) {
    // 错误已处理
  } finally {
    row.refreshing = false;
  }
};

const handleRefreshAllBalance = async () => {
  refreshing.value = true;
  try {
    await refreshAllBalance();
    Message.success("已开始刷新所有余额，请稍后刷新页面查看");
  } catch (error) {
    // 错误已处理
  } finally {
    refreshing.value = false;
  }
};

const handleTestAccount = async (row) => {
  row.testing = true;
  try {
    const res = await testAccount(row.id);
    testDialog.data = res.data || {
      accountId: row.id,
      accountName: row.name,
      success: Boolean(res.success),
      message: res.message,
    };
    testDialog.visible = true;

    if (testDialog.data.success) {
      Message.success("账号测试通过");
    } else {
      Message.warning(testDialog.data.message || "账号测试未通过");
    }
    loadData();
  } catch (error) {
    // 错误已处理
  } finally {
    row.testing = false;
  }
};

// 格式化限制日期
const formatLimitDate = (date) => {
  if (!date) return "-";
  return formatLocalizedDateTime(date);
};

// 打开使用限制对话框
const handleUsageLimit = async (row) => {
  usageLimitDialog.accountId = row.id;
  usageLimitDialog.accountName = row.name;
  usageLimitDialog.currentLimit = null;
  usageLimitDialog.form = {
    limitType: "daily",
    limitCount: 1000,
    limitDays: 1,
    resetTimeValue: "00:00:00",
  };

  try {
    const res = await getUsageLimit(row.id);
    if (res.data) {
      usageLimitDialog.currentLimit = res.data;
      usageLimitDialog.form.limitType = res.data.limitType || "daily";
      usageLimitDialog.form.limitCount = res.data.limitCount || 1000;
      usageLimitDialog.form.limitDays = res.data.limitDays || 1;
      usageLimitDialog.form.resetTimeValue = res.data.resetTime || "00:00:00";
    }
  } catch (error) {
    // 没有限制配置，使用默认值
  }

  usageLimitDialog.visible = true;
};

// 提交使用限制
const handleUsageLimitSubmit = async () => {
  if (!usageLimitDialog.form.limitCount || usageLimitDialog.form.limitCount < 1) {
    Message.warning("请输入有效的次数限制");
    return;
  }

  if (usageLimitDialog.form.limitType === "custom" && (!usageLimitDialog.form.limitDays || usageLimitDialog.form.limitDays < 1)) {
    Message.warning("请输入有效的天数");
    return;
  }

  usageLimitDialog.loading = true;
  try {
    const data = {
      limitType: usageLimitDialog.form.limitType,
      limitCount: usageLimitDialog.form.limitCount,
      limitDays: usageLimitDialog.form.limitType === "custom" ? usageLimitDialog.form.limitDays : null,
      resetTime: usageLimitDialog.form.resetTimeValue || "00:00:00",
    };

    await setUsageLimit(usageLimitDialog.accountId, data);
    Message.success("设置使用限制成功");
    usageLimitDialog.visible = false;
    loadData();
  } catch (error) {
    // 错误已处理
  } finally {
    usageLimitDialog.loading = false;
  }
};

// 重置使用计数
const handleResetUsageCount = async () => {
  usageLimitDialog.resetting = true;
  try {
    await resetUsageCount(usageLimitDialog.accountId);
    Message.success("重置成功");
    // 重新获取限制信息
    const res = await getUsageLimit(usageLimitDialog.accountId);
    if (res.data) {
      usageLimitDialog.currentLimit = res.data;
    }
  } catch (error) {
    // 错误已处理
  } finally {
    usageLimitDialog.resetting = false;
  }
};

// 删除使用限制
const handleRemoveUsageLimit = async () => {
  Modal.confirm({
    title: "确认删除",
    content: "确定要删除该账号的使用限制吗？删除后账号将恢复正常使用。",
    okText: "确定",
    cancelText: "取消",
    onOk: async () => {
      usageLimitDialog.removing = true;
      try {
        await removeUsageLimit(usageLimitDialog.accountId);
        Message.success("删除成功");
        usageLimitDialog.visible = false;
        loadData();
      } catch (error) {
        // 错误已处理
      } finally {
        usageLimitDialog.removing = false;
      }
    },
  });
};

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
  loadSites();
  loadData();
  // 计算表格高度
  setTimeout(() => {
    calcTableHeight();
  }, 100);
  window.addEventListener("resize", calcTableHeight);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
  window.removeEventListener("resize", calcTableHeight);
});
</script>

<style scoped>
.account-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.account-list > :deep(.arco-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.account-list > :deep(.arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.toolbar {
  width: 100%;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

/* 为下拉菜单设置固定宽度 */
.toolbar :deep(.arco-select) {
  width: 120px; /* 设置固定宽度 */
}

/* 或者分别设置不同宽度 */
.toolbar .filter-select-auto {
  width: 120px; /* 状态下拉菜单宽度 */
}

.toolbar .filter-select-auto:last-of-type {
  width: 150px; /* 网站下拉菜单宽度（如果是第二个） */
}

/* 日期选择器宽度 */
.toolbar .date-picker {
  width: 240px; /* 日期范围选择器宽度 */
}

/* 搜索按钮保持自动宽度 */
.toolbar .arco-btn {
  flex-shrink: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap; /* 移动端允许换行 */
    gap: 8px;
  }

  .toolbar :deep(.arco-select),
  .toolbar .date-picker {
    width: 100%; /* 移动端占满宽度 */
  }
}

.filter-select-auto {
  width: auto !important;
  min-width: 80px;
}

.filter-select-auto :deep(.arco-select-view) {
  width: auto !important;
}

.filter-select-auto :deep(.arco-select-view-input) {
  width: auto !important;
}

.filter-input {
  width: 180px;
}

/* 表格容器 - 固定高度，内部滚动 */
.table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.table-wrapper :deep(.arco-table-container) {
  height: 100%;
}

.table-wrapper :deep(.arco-table) {
  height: 100%;
}

.table-wrapper :deep(.arco-table-body) {
  overflow-y: auto !important;
}

/* 分页固定在底部 */
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* 表单样式 */
.form-tip {
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 1.5;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-fill-1);
  border-radius: 4px;
}

.param-input {
  flex: 1;
}

.param-input-sm {
  width: 100px;
}

.param-unit {
  color: var(--color-text-3);
  font-size: 13px;
  flex-shrink: 0;
}

.duration-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.low-balance {
  color: #f56c6c;
  font-weight: bold;
}

.success-count {
  display: inline-block;
  min-width: 40px;
  text-align: center;
  font-weight: 500;
  color: var(--color-text-1);
}

.compact-time {
  display: inline-block;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}

.expired {
  color: #f56c6c;
}

/* 移动端卡片样式 */
.mobile-card-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mobile-card-wrapper :deep(.arco-spin) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mobile-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mobile-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.card-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.card-label {
  color: #909399;
  font-size: 13px;
  min-width: 70px;
  flex-shrink: 0;
}

.card-value {
  color: #606266;
  font-size: 13px;
  word-break: break-all;
}

.clickable-time {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
  flex-wrap: wrap;
}

.card-actions .arco-btn {
  flex: 1;
  min-width: 60px;
}

.test-dialog-tip {
  margin-top: 12px;
  color: #86909c;
  font-size: 13px;
  line-height: 1.6;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .toolbar .arco-btn {
    flex: 1;
  }

  .filter-select-auto,
  .filter-input {
    flex: 1;
    min-width: 100px;
  }

  .pagination {
    overflow-x: auto;
    justify-content: center;
  }

  .param-row {
    flex-wrap: wrap;
    padding: 12px;
  }

  .param-input-sm {
    width: calc(50% - 12px);
  }

  .param-unit {
    width: 30px;
  }
}
</style>
