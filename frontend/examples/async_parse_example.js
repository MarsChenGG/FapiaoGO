/**
 * 异步发票解析 - 前端集成示例
 * 
 * 展示如何使用新的 /api/parse-jobs 接口
 */

// ═══════════════════════════════════════════════════════════
// 1. 基础使用：创建任务并轮询结果
// ═══════════════════════════════════════════════════════════

/**
 * 异步解析发票（推荐方式）
 * @param {File} file - 发票文件
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 解析结果
 */
async function parseInvoiceAsync(file, options = {}) {
  const {
    autoOrient = true,
    onProgress = null,        // 进度回调 (progress: 0-100)
    onStatusChange = null,    // 状态回调 (status: 'pending'|'running'|'success'|'failed')
    pollInterval = 1000,      // 轮询间隔（毫秒）
    timeout = 120000          // 超时时间（毫秒）
  } = options;

  // 1. 创建任务
  const formData = new FormData();
  formData.append('file', file);
  formData.append('autoOrient', autoOrient ? '1' : '0');

  const createResponse = await fetch('http://localhost:5000/api/parse-jobs', {
    method: 'POST',
    body: formData
  });

  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(error.error || '创建任务失败');
  }

  const { job_id, status } = await createResponse.json();
  console.log(`任务已创建: ${job_id} (状态: ${status})`);

  // 2. 轮询任务状态
  const startTime = Date.now();
  let lastProgress = 0;

  return new Promise((resolve, reject) => {
    const poll = setInterval(async () => {
      // 检查超时
      if (Date.now() - startTime > timeout) {
        clearInterval(poll);
        reject(new Error('解析超时'));
        return;
      }

      try {
        const statusResponse = await fetch(`http://localhost:5000/api/parse-jobs/${job_id}`);
        const { job } = await statusResponse.json();

        // 触发状态回调
        if (onStatusChange && job.status !== lastStatus) {
          onStatusChange(job.status);
          lastStatus = job.status;
        }

        // 触发进度回调
        if (onProgress && job.progress !== lastProgress) {
          onProgress(job.progress);
          lastProgress = job.progress;
        }

        // 检查任务状态
        if (job.status === 'success') {
          clearInterval(poll);
          
          // 获取解析结果
          const resultResponse = await fetch(`http://localhost:5000/api/parse-jobs/${job_id}/result`);
          const result = await resultResponse.json();
          resolve(result);
          
        } else if (job.status === 'failed') {
          clearInterval(poll);
          reject(new Error(job.error || '解析失败'));
          
        } else if (job.status === 'cancelled') {
          clearInterval(poll);
          reject(new Error('任务已取消'));
        }
        // pending 或 running 状态继续轮询
        
      } catch (error) {
        clearInterval(poll);
        reject(error);
      }
    }, pollInterval);
  });
}

// ═══════════════════════════════════════════════════════════
// 2. 使用示例：带进度条的解析
// ═══════════════════════════════════════════════════════════

/**
 * 带UI的解析示例
 */
async function parseInvoiceWithUI(fileInput) {
  const file = fileInput.files[0];
  if (!file) {
    alert('请选择发票文件');
    return;
  }

  // 显示进度条
  const progressBar = document.getElementById('progress-bar');
  const statusText = document.getElementById('status-text');
  const resultDiv = document.getElementById('result');
  
  progressBar.style.display = 'block';
  progressBar.value = 0;
  statusText.textContent = '准备中...';
  resultDiv.innerHTML = '';

  try {
    const result = await parseInvoiceAsync(file, {
      onProgress: (progress) => {
        progressBar.value = progress;
        statusText.textContent = `解析中... ${progress}%`;
      },
      onStatusChange: (status) => {
        const statusMap = {
          'pending': '排队中...',
          'running': '解析中...',
          'success': '解析完成！',
          'failed': '解析失败',
          'cancelled': '已取消'
        };
        statusText.textContent = statusMap[status] || status;
      }
    });

    // 显示结果
    statusText.textContent = '✅ 解析完成！';
    displayResult(result);
    
  } catch (error) {
    statusText.textContent = `❌ ${error.message}`;
    console.error('解析失败:', error);
  } finally {
    // 隐藏进度条（延迟2秒）
    setTimeout(() => {
      progressBar.style.display = 'none';
    }, 2000);
  }
}

// ═══════════════════════════════════════════════════════════
// 3. 批量解析：并发控制
// ═══════════════════════════════════════════════════════════

/**
 * 批量解析发票（带并发控制）
 * @param {File[]} files - 发票文件列表
 * @param {number} concurrency - 并发数（默认3）
 */
async function parseInvoicesBatch(files, concurrency = 3) {
  const results = [];
  const queue = [...files];
  const activeTasks = [];

  async function processNext() {
    if (queue.length === 0) return;

    const file = queue.shift();
    const task = parseInvoiceAsync(file, {
      onProgress: (progress) => {
        console.log(`[${file.name}] 进度: ${progress}%`);
      }
    })
    .then(result => {
      results.push({ file: file.name, status: 'success', result });
      console.log(`✅ ${file.name} 解析完成`);
    })
    .catch(error => {
      results.push({ file: file.name, status: 'failed', error: error.message });
      console.error(`❌ ${file.name} 解析失败:`, error.message);
    })
    .finally(() => {
      // 从活跃任务中移除
      const index = activeTasks.indexOf(task);
      if (index > -1) activeTasks.splice(index, 1);
      
      // 处理下一个
      processNext();
    });

    activeTasks.push(task);
  }

  // 启动初始并发任务
  for (let i = 0; i < Math.min(concurrency, files.length); i++) {
    processNext();
  }

  // 等待所有任务完成
  await Promise.all(activeTasks);
  
  return results;
}

// ═══════════════════════════════════════════════════════════
// 4. 任务管理：取消任务
// ═══════════════════════════════════════════════════════════

/**
 * 取消解析任务
 * @param {string} jobId - 任务ID
 */
async function cancelParseJob(jobId) {
  const response = await fetch(`http://localhost:5000/api/parse-jobs/${jobId}/cancel`, {
    method: 'POST'
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('任务已取消');
    return true;
  } else {
    console.warn('取消失败:', result.error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// 5. 任务历史：列出所有任务
// ═══════════════════════════════════════════════════════════

/**
 * 获取任务列表
 * @param {number} limit - 每页数量
 * @param {number} offset - 偏移量
 */
async function listParseJobs(limit = 20, offset = 0) {
  const response = await fetch(
    `http://localhost:5000/api/parse-jobs?limit=${limit}&offset=${offset}`
  );

  const { jobs, total } = await response.json();
  
  console.log(`总任务数: ${total}`);
  jobs.forEach(job => {
    console.log(`- ${job.file_name} | ${job.status} | ${job.progress}%`);
  });

  return { jobs, total };
}

// ═══════════════════════════════════════════════════════════
// 6. React 组件示例
// ═══════════════════════════════════════════════════════════

/**
 * React 组件：异步发票解析
 * 
 * import { useState } from 'react';
 * 
 * function AsyncInvoiceParser() {
 *   const [progress, setProgress] = useState(0);
 *   const [status, setStatus] = useState('idle');
 *   const [result, setResult] = useState(null);
 *   const [error, setError] = useState(null);
 * 
 *   const handleParse = async (file) => {
 *     setStatus('parsing');
 *     setError(null);
 *     
 *     try {
 *       const result = await parseInvoiceAsync(file, {
 *         onProgress: setProgress,
 *         onStatusChange: setStatus
 *       });
 *       setResult(result);
 *       setStatus('success');
 *     } catch (err) {
 *       setError(err.message);
 *       setStatus('failed');
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <input type="file" onChange={(e) => handleParse(e.target.files[0])} />
 *       
 *       {status === 'parsing' && (
 *         <div>
 *           <progress value={progress} max="100" />
 *           <span>{progress}%</span>
 *         </div>
 *       )}
 *       
 *       {error && <div className="error">{error}</div>}
 *       {result && <InvoiceResult data={result} />}
 *     </div>
 *   );
 * }
 */

// ═══════════════════════════════════════════════════════════
// 7. Vue 组件示例
// ═══════════════════════════════════════════════════════════

/**
 * Vue 组件：异步发票解析
 * 
 * <template>
 *   <div>
 *     <input type="file" @change="handleParse" />
 *     
 *     <div v-if="status === 'parsing'">
 *       <progress :value="progress" max="100" />
 *       <span>{{ progress }}%</span>
 *     </div>
 *     
 *     <div v-if="error" class="error">{{ error }}</div>
 *     <InvoiceResult v-if="result" :data="result" />
 *   </div>
 * </template>
 * 
 * <script setup>
 * import { ref } from 'vue';
 * 
 * const progress = ref(0);
 * const status = ref('idle');
 * const result = ref(null);
 * const error = ref(null);
 * 
 * const handleParse = async (event) => {
 *   const file = event.target.files[0];
 *   status.value = 'parsing';
 *   error.value = null;
 *   
 *   try {
 *     result.value = await parseInvoiceAsync(file, {
 *       onProgress: (p) => progress.value = p,
 *       onStatusChange: (s) => status.value = s
 *     });
 *     status.value = 'success';
 *   } catch (err) {
 *     error.value = err.message;
 *     status.value = 'failed';
 *   }
 * };
 * </script>
 */

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════

export {
  parseInvoiceAsync,
  parseInvoiceWithUI,
  parseInvoicesBatch,
  cancelParseJob,
  listParseJobs
};
