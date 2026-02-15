## [1.0.2](https://github.com/dbfx/wsl-cleaner/compare/v1.0.1...v1.0.2) (2026-02-15)


### Features

* distro selection, code improvement, tests. ci ([f52cb15](https://github.com/dbfx/wsl-cleaner/commit/f52cb157474c4dad73ea6a69ab3da3468cf2d9ed))



# Changelog

All notable changes to this project will be documented in this file.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and this changelog is auto-generated with [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog).

## [1.0.2] - 2026-02-15

### Added
- Unit test suite with Vitest (52 tests across 3 files)
- CI/CD pipeline with GitHub Actions (test on push/PR, build + release on tag)
- Auto-generated changelog workflow with conventional-changelog
- Extracted pure utility functions into testable modules (`lib/utils.js`, `renderer/utils.js`, `renderer/tasks.js`)

## [1.0.1] - 2026-02-15

### Added
- Simple mode: one-click Clean & Compact workflow
- Advanced mode: individual task toggles, stale directory scanner, manual compaction
- 47 cleanup tasks across 5 categories (System, User & Editor, Package Managers, Framework & Project, Aggressive)
- Tool auto-detection for 22+ tools (apt, dnf, npm, yarn, docker, etc.)
- Stale directory scanner with configurable age threshold
- VHDX disk compaction via Optimize-VHD with UAC elevation
- Filesystem TRIM support with zero-fill fallback
- Real-time streaming output for all operations
- Auto-updater via electron-updater with GitHub Releases
- Custom frameless window with dark mode UI
- Single-instance lock
- Dual distro support (Debian/Ubuntu with apt, Fedora/RHEL with dnf)

## [1.0.0] - 2026-02-14

### Added
- Initial release
