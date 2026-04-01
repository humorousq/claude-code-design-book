#!/usr/bin/env node

/**
 * PDF 生成脚本
 *
 * 此脚本从构建后的 HTML 文件生成 PDF 版本的书籍。
 * 它依赖于 puppeteer 进行渲染。
 *
 * 使用方法：
 *   npm run generate:pdf
 *
 * 环境变量：
 *   PDF_OUTPUT - PDF 输出路径（默认：./dist/book.pdf）
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// 配置
const config = {
  outputDir: process.env.PDF_OUTPUT || path.join(rootDir, 'dist', 'book.pdf'),
  buildDir: path.join(rootDir, 'docs', '.vitepress', 'dist'),
  tempDir: path.join(rootDir, '.pdf-temp')
}

/**
 * 检查依赖是否安装
 */
function checkDependencies() {
  try {
    // 检查是否安装了 puppeteer
    const puppeteerPath = path.join(rootDir, 'node_modules', 'puppeteer')
    if (!fs.existsSync(puppeteerPath)) {
      console.log('正在安装 puppeteer...')
      execSync('npm install --save-dev puppeteer', { cwd: rootDir, stdio: 'inherit' })
    }
    return true
  } catch (error) {
    console.error('依赖检查失败:', error.message)
    return false
  }
}

/**
 * 生成 PDF
 */
async function generatePDF() {
  // 检查构建目录是否存在
  if (!fs.existsSync(config.buildDir)) {
    console.error('构建目录不存在，请先运行 npm run docs:build')
    process.exit(1)
  }

  // 动态导入 puppeteer
  const puppeteer = await import('puppeteer')

  console.log('正在启动浏览器...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    const page = await browser.newPage()

    // 读取首页
    const indexPath = path.join(config.buildDir, 'index.html')
    if (!fs.existsSync(indexPath)) {
      throw new Error('找不到 index.html，请确保构建成功')
    }

    console.log('正在加载页面...')
    await page.goto(`file://${indexPath}`, {
      waitUntil: 'networkidle0'
    })

    // 确保输出目录存在
    const outputDir = path.dirname(config.outputDir)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    console.log('正在生成 PDF...')
    await page.pdf({
      path: config.outputDir,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      }
    })

    console.log(`PDF 已生成: ${config.outputDir}`)
  } finally {
    await browser.close()
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('PDF 生成工具')
  console.log('='.repeat(40))

  // 检查依赖
  if (!checkDependencies()) {
    process.exit(1)
  }

  // 生成 PDF
  await generatePDF()

  console.log('完成!')
}

// 运行主函数
main().catch(error => {
  console.error('生成 PDF 失败:', error)
  process.exit(1)
})
