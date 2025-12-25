#!/usr/bin/env python3
"""
BrainDrive Evaluator Plugin Lifecycle Manager

Handles install/update/delete operations for the BrainDrive Evaluator plugin
using BrainDrive's multi-user plugin lifecycle management architecture.
"""

import json
import logging
import datetime
import os
import shutil
import asyncio
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import structlog

logger = structlog.get_logger()

# Import the base lifecycle manager
try:
    from app.plugins.base_lifecycle_manager import BaseLifecycleManager
    logger.info("BrainDriveEvaluator: Using BaseLifecycleManager from app.plugins")
except ImportError:
    try:
        import sys
        current_dir = os.path.dirname(os.path.abspath(__file__))
        backend_path = os.path.join(current_dir, "..", "..", "..", "..", "app", "plugins")
        backend_path = os.path.abspath(backend_path)
        
        if os.path.exists(backend_path):
            if backend_path not in sys.path:
                sys.path.insert(0, backend_path)
            from base_lifecycle_manager import BaseLifecycleManager
            logger.info(f"BrainDriveEvaluator: Using BaseLifecycleManager from: {backend_path}")
        else:
            # Minimal implementation for remote installations
            logger.warning(f"BrainDriveEvaluator: BaseLifecycleManager not found, using minimal implementation")
            from abc import ABC, abstractmethod
            from datetime import datetime
            from pathlib import Path
            from typing import Set
            
            class BaseLifecycleManager(ABC):
                """Minimal base class for remote installations"""
                def __init__(self, plugin_slug: str, version: str, shared_storage_path: Path):
                    self.plugin_slug = plugin_slug
                    self.version = version
                    self.shared_path = shared_storage_path
                    self.active_users: Set[str] = set()
                    self.instance_id = f"{plugin_slug}_{version}"
                    self.created_at = datetime.now()
                    self.last_used = datetime.now()
                
                async def install_for_user(self, user_id: str, db, shared_plugin_path: Path):
                    if user_id in self.active_users:
                        return {'success': False, 'error': 'Plugin already installed for user'}
                    result = await self._perform_user_installation(user_id, db, shared_plugin_path)
                    if result['success']:
                        self.active_users.add(user_id)
                        self.last_used = datetime.now()
                    return result
                
                async def uninstall_for_user(self, user_id: str, db):
                    if user_id not in self.active_users:
                        return {'success': False, 'error': 'Plugin not installed for user'}
                    result = await self._perform_user_uninstallation(user_id, db)
                    if result['success']:
                        self.active_users.discard(user_id)
                        self.last_used = datetime.now()
                    return result
                
                @abstractmethod
                async def get_plugin_metadata(self): pass
                @abstractmethod
                async def get_module_metadata(self): pass
                @abstractmethod
                async def _perform_user_installation(self, user_id, db, shared_plugin_path): pass
                @abstractmethod
                async def _perform_user_uninstallation(self, user_id, db): pass
            
            logger.info("BrainDriveEvaluator: Using minimal BaseLifecycleManager implementation")
            
    except ImportError as e:
        logger.error(f"BrainDriveEvaluator: Failed to import BaseLifecycleManager: {e}")
        raise ImportError("BrainDriveEvaluator plugin requires BaseLifecycleManager")


class BrainDriveEvaluatorLifecycleManager(BaseLifecycleManager):
    """Lifecycle manager for BrainDrive Evaluator plugin"""
    
    def __init__(self, plugins_base_dir: str = None):
        """Initialize the lifecycle manager"""
        # Plugin metadata
        self.plugin_data = {
            "name": "BrainDriveEvaluator",
            "description": "Automated evaluation of AI coaching models using WhyFinder simulation",
            "version": "1.0.0",
            "type": "frontend",
            "icon": "ClipboardCheck",
            "category": "AI Tools",
            "official": False,
            "author": "Navaneeth Krishnan",
            "compatibility": "1.0.0",
            "scope": "BrainDriveEvaluator",
            "bundle_method": "webpack",
            "bundle_location": "dist/remoteEntry.js",
            "is_local": False,
            "long_description": "BrainDrive Evaluator automates end-to-end evaluation of AI coaching models. It simulates the complete WhyFinder coaching flow (12 exchanges), Ikigai Builder (4 phases), and Decision Helper, then judges the model performance using 7 metrics: Clarity, Structural Correctness, Consistency, Coverage, Hallucination, Decision Expertise, and Safety.",
            "plugin_slug": "BrainDriveEvaluator",
            "source_type": "github",
            "source_url": "https://github.com/navaneethkrishnansuresh/BrainDriveEvaluator",
            "update_check_url": "https://api.github.com/repos/navaneethkrishnansuresh/BrainDriveEvaluator/releases/latest",
            "last_update_check": None,
            "update_available": False,
            "latest_version": None,
            "installation_type": "remote",
            "permissions": ["storage.read", "storage.write", "api.access"]
        }
        
        # Module metadata
        self.module_data = [
            {
                "name": "BrainDriveEvaluator",
                "display_name": "BrainDrive Evaluator",
                "description": "Evaluate AI coaching models with automated WhyFinder simulation",
                "icon": "ClipboardCheck",
                "category": "AI Tools",
                "priority": 1,
                "props": {
                    "title": "BrainDrive Evaluator",
                    "description": "Automated AI coaching model evaluation"
                },
                "config_fields": {
                    "openai_api_key": {
                        "type": "password",
                        "description": "OpenAI API Key for synthetic user and judge models",
                        "default": ""
                    },
                    "default_temperature": {
                        "type": "number",
                        "description": "Default temperature for model calls",
                        "default": 0
                    }
                },
                "messages": {},
                "required_services": {
                    "api": {"methods": ["get", "post", "put", "delete"], "version": "1.0.0"},
                    "theme": {"methods": ["getCurrentTheme", "addThemeChangeListener", "removeThemeChangeListener"], "version": "1.0.0"},
                    "settings": {"methods": ["getSetting", "setSetting", "getSettingDefinitions"], "version": "1.0.0"},
                    "event": {"methods": ["sendMessage", "subscribeToMessages", "unsubscribeFromMessages"], "version": "1.0.0"},
                    "pageContext": {"methods": ["getCurrentPageContext", "onPageContextChange"], "version": "1.0.0"}
                },
                "dependencies": [],
                "layout": {
                    "minWidth": 8,
                    "minHeight": 6,
                    "defaultWidth": 12,
                    "defaultHeight": 8
                },
                "tags": ["ai", "evaluation", "coaching", "whyfinder", "benchmark"]
            }
        ]
        
        # Determine shared path
        logger.info(f"BrainDriveEvaluator: plugins_base_dir - {plugins_base_dir}")
        if plugins_base_dir:
            shared_path = Path(plugins_base_dir) / "shared" / self.plugin_data['plugin_slug'] / f"v{self.plugin_data['version']}"
        else:
            shared_path = Path(__file__).parent
        logger.info(f"BrainDriveEvaluator: shared_path - {shared_path}")
        
        super().__init__(
            plugin_slug=self.plugin_data['plugin_slug'],
            version=self.plugin_data['version'],
            shared_storage_path=shared_path
        )
    
    @property
    def PLUGIN_DATA(self):
        """Compatibility property for remote installer validation"""
        return self.plugin_data
    
    async def get_plugin_metadata(self) -> Dict[str, Any]:
        """Return plugin metadata"""
        return self.plugin_data
    
    async def get_module_metadata(self) -> list:
        """Return module definitions"""
        return self.module_data
    
    async def _perform_user_installation(self, user_id: str, db: AsyncSession, shared_plugin_path: Path) -> Dict[str, Any]:
        """Perform user-specific installation"""
        try:
            db_result = await self._create_database_records(user_id, db)
            if not db_result['success']:
                return db_result
            
            # Create plugin page
            page_result = await self._create_plugin_page(user_id, db, db_result['modules_created'])
            if not page_result.get('success'):
                # Rollback plugin records if page creation fails
                plugin_id = db_result.get('plugin_id')
                if plugin_id:
                    await self._delete_database_records(user_id, plugin_id, db)
                return page_result
            
            logger.info(f"BrainDriveEvaluator: User installation completed for {user_id}")
            return {
                'success': True,
                'plugin_id': db_result['plugin_id'],
                'plugin_slug': self.plugin_data['plugin_slug'],
                'plugin_name': self.plugin_data['name'],
                'modules_created': db_result['modules_created'],
                'page_id': page_result.get('page_id'),
                'page_created': page_result.get('created', False)
            }
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: User installation failed for {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _perform_user_uninstallation(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Perform user-specific uninstallation"""
        try:
            existing_check = await self._check_existing_plugin(user_id, db)
            if not existing_check['exists']:
                return {'success': False, 'error': 'Plugin not found for user'}
            
            plugin_id = existing_check['plugin_id']
            
            # Delete plugin page first
            page_result = await self._delete_plugin_page(user_id, db)
            if not page_result.get('success'):
                return page_result
            
            delete_result = await self._delete_database_records(user_id, plugin_id, db)
            if not delete_result['success']:
                return delete_result
            
            logger.info(f"BrainDriveEvaluator: User uninstallation completed for {user_id}")
            return {
                'success': True,
                'plugin_id': plugin_id,
                'deleted_modules': delete_result['deleted_modules'],
                'page_deleted': page_result.get('deleted_rows', 0) > 0
            }
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: User uninstallation failed for {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _copy_plugin_files_impl(self, user_id: str, target_dir: Path, update: bool = False) -> Dict[str, Any]:
        """Copy plugin files to target directory"""
        try:
            source_dir = Path(__file__).parent
            copied_files = []
            
            exclude_patterns = {
                'node_modules', 'package-lock.json', '.git', '.gitignore',
                '__pycache__', '*.pyc', '.DS_Store', 'Thumbs.db'
            }
            
            def should_copy(path: Path) -> bool:
                for part in path.parts:
                    if part in exclude_patterns:
                        return False
                for pattern in exclude_patterns:
                    if '*' in pattern and path.name.endswith(pattern.replace('*', '')):
                        return False
                return True
            
            for item in source_dir.rglob('*'):
                if item.name == 'lifecycle_manager.py' and item == Path(__file__):
                    continue
                    
                relative_path = item.relative_to(source_dir)
                
                if not should_copy(relative_path):
                    continue
                
                target_path = target_dir / relative_path
                
                try:
                    if item.is_file():
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        if update and target_path.exists():
                            target_path.unlink()
                        shutil.copy2(item, target_path)
                        copied_files.append(str(relative_path))
                    elif item.is_dir():
                        target_path.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    logger.warning(f"BrainDriveEvaluator: Failed to copy {relative_path}: {e}")
                    continue
            
            # Copy lifecycle_manager.py
            lifecycle_manager_source = source_dir / 'lifecycle_manager.py'
            lifecycle_manager_target = target_dir / 'lifecycle_manager.py'
            if lifecycle_manager_source.exists():
                lifecycle_manager_target.parent.mkdir(parents=True, exist_ok=True)
                if update and lifecycle_manager_target.exists():
                    lifecycle_manager_target.unlink()
                shutil.copy2(lifecycle_manager_source, lifecycle_manager_target)
                copied_files.append('lifecycle_manager.py')
            
            logger.info(f"BrainDriveEvaluator: Copied {len(copied_files)} files to {target_dir}")
            return {'success': True, 'copied_files': copied_files}
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error copying plugin files: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _validate_installation_impl(self, user_id: str, plugin_dir: Path) -> Dict[str, Any]:
        """Validate plugin installation"""
        try:
            required_files = ["package.json", "dist/remoteEntry.js"]
            missing_files = []
            
            for file_path in required_files:
                if not (plugin_dir / file_path).exists():
                    missing_files.append(file_path)
            
            if missing_files:
                return {
                    'valid': False,
                    'error': f"BrainDriveEvaluator: Missing required files: {', '.join(missing_files)}"
                }
            
            # Validate package.json
            package_json_path = plugin_dir / "package.json"
            try:
                with open(package_json_path, 'r') as f:
                    package_data = json.load(f)
                
                required_fields = ["name", "version"]
                for field in required_fields:
                    if field not in package_data:
                        return {
                            'valid': False,
                            'error': f'BrainDriveEvaluator: package.json missing field: {field}'
                        }
                        
            except (json.JSONDecodeError, FileNotFoundError) as e:
                return {
                    'valid': False,
                    'error': f'BrainDriveEvaluator: Invalid package.json: {e}'
                }
            
            # Validate bundle
            bundle_path = plugin_dir / "dist" / "remoteEntry.js"
            if bundle_path.stat().st_size == 0:
                return {
                    'valid': False,
                    'error': 'BrainDriveEvaluator: Bundle file is empty'
                }
            
            logger.info(f"BrainDriveEvaluator: Validation passed for user {user_id}")
            return {'valid': True}
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error validating installation: {e}")
            return {'valid': False, 'error': str(e)}
    
    async def _get_plugin_health_impl(self, user_id: str, plugin_dir: Path) -> Dict[str, Any]:
        """Check plugin health"""
        try:
            health_info = {
                'bundle_exists': False,
                'bundle_size': 0,
                'package_json_valid': False
            }
            
            bundle_path = plugin_dir / "dist" / "remoteEntry.js"
            if bundle_path.exists():
                health_info['bundle_exists'] = True
                health_info['bundle_size'] = bundle_path.stat().st_size
            
            package_json_path = plugin_dir / "package.json"
            if package_json_path.exists():
                try:
                    with open(package_json_path, 'r') as f:
                        json.load(f)
                    health_info['package_json_valid'] = True
                except json.JSONDecodeError:
                    pass
            
            is_healthy = (
                health_info['bundle_exists'] and 
                health_info['bundle_size'] > 0 and
                health_info['package_json_valid']
            )
            
            return {
                'healthy': is_healthy,
                'details': health_info
            }
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error checking health: {e}")
            return {
                'healthy': False,
                'details': {'error': str(e)}
            }
    
    async def _check_existing_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Check if plugin exists for user"""
        try:
            plugin_slug = self.plugin_data['plugin_slug']
            
            plugin_query = text("""
            SELECT id, name, version, enabled, created_at, updated_at, plugin_slug
            FROM plugin
            WHERE user_id = :user_id AND plugin_slug = :plugin_slug
            """)
            
            result = await db.execute(plugin_query, {
                'user_id': user_id,
                'plugin_slug': plugin_slug
            })
            
            plugin_row = result.fetchone()
            if plugin_row:
                return {
                    'exists': True,
                    'plugin_id': plugin_row.id,
                    'plugin_info': {
                        'id': plugin_row.id,
                        'name': plugin_row.name,
                        'version': plugin_row.version,
                        'enabled': plugin_row.enabled,
                        'created_at': plugin_row.created_at,
                        'updated_at': plugin_row.updated_at
                    }
                }
            else:
                return {'exists': False}
                
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error checking existing plugin: {e}")
            return {'exists': False, 'error': str(e)}
    
    async def _create_database_records(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Create plugin and module records in database"""
        try:
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            plugin_slug = self.plugin_data['plugin_slug']
            plugin_id = f"{user_id}_{plugin_slug}"
            
            logger.info(f"BrainDriveEvaluator: Creating database records for {plugin_id}")
            
            plugin_stmt = text("""
            INSERT INTO plugin
            (id, name, description, version, type, enabled, icon, category, status,
            official, author, last_updated, compatibility, downloads, scope,
            bundle_method, bundle_location, is_local, long_description,
            config_fields, messages, dependencies, created_at, updated_at, user_id,
            plugin_slug, source_type, source_url, update_check_url, last_update_check,
            update_available, latest_version, installation_type, permissions)
            VALUES
            (:id, :name, :description, :version, :type, :enabled, :icon, :category,
            :status, :official, :author, :last_updated, :compatibility, :downloads,
            :scope, :bundle_method, :bundle_location, :is_local, :long_description,
            :config_fields, :messages, :dependencies, :created_at, :updated_at, :user_id,
            :plugin_slug, :source_type, :source_url, :update_check_url, :last_update_check,
            :update_available, :latest_version, :installation_type, :permissions)
            """)
            
            await db.execute(plugin_stmt, {
                'id': plugin_id,
                'name': self.plugin_data['name'],
                'description': self.plugin_data['description'],
                'version': self.plugin_data['version'],
                'type': self.plugin_data['type'],
                'enabled': True,
                'icon': self.plugin_data['icon'],
                'category': self.plugin_data['category'],
                'status': 'activated',
                'official': self.plugin_data['official'],
                'author': self.plugin_data['author'],
                'last_updated': current_time,
                'compatibility': self.plugin_data['compatibility'],
                'downloads': 0,
                'scope': self.plugin_data['scope'],
                'bundle_method': self.plugin_data['bundle_method'],
                'bundle_location': self.plugin_data['bundle_location'],
                'is_local': self.plugin_data['is_local'],
                'long_description': self.plugin_data['long_description'],
                'config_fields': json.dumps({}),
                'messages': None,
                'dependencies': None,
                'created_at': current_time,
                'updated_at': current_time,
                'user_id': user_id,
                'plugin_slug': plugin_slug,
                'source_type': self.plugin_data['source_type'],
                'source_url': self.plugin_data['source_url'],
                'update_check_url': self.plugin_data['update_check_url'],
                'last_update_check': self.plugin_data['last_update_check'],
                'update_available': self.plugin_data['update_available'],
                'latest_version': self.plugin_data['latest_version'],
                'installation_type': self.plugin_data['installation_type'],
                'permissions': json.dumps(self.plugin_data['permissions'])
            })
            
            # Create modules
            modules_created = []
            for module_data in self.module_data:
                module_id = f"{user_id}_{plugin_slug}_{module_data['name']}"
                
                module_stmt = text("""
                INSERT INTO module
                (id, plugin_id, name, display_name, description, icon, category,
                enabled, priority, props, config_fields, messages, required_services,
                dependencies, layout, tags, created_at, updated_at, user_id)
                VALUES
                (:id, :plugin_id, :name, :display_name, :description, :icon, :category,
                :enabled, :priority, :props, :config_fields, :messages, :required_services,
                :dependencies, :layout, :tags, :created_at, :updated_at, :user_id)
                """)
                
                await db.execute(module_stmt, {
                    'id': module_id,
                    'plugin_id': plugin_id,
                    'name': module_data['name'],
                    'display_name': module_data['display_name'],
                    'description': module_data['description'],
                    'icon': module_data['icon'],
                    'category': module_data['category'],
                    'enabled': True,
                    'priority': module_data['priority'],
                    'props': json.dumps(module_data['props']),
                    'config_fields': json.dumps(module_data['config_fields']),
                    'messages': json.dumps(module_data['messages']),
                    'required_services': json.dumps(module_data['required_services']),
                    'dependencies': json.dumps(module_data['dependencies']),
                    'layout': json.dumps(module_data['layout']),
                    'tags': json.dumps(module_data['tags']),
                    'created_at': current_time,
                    'updated_at': current_time,
                    'user_id': user_id
                })
                
                modules_created.append(module_id)
            
            await db.commit()
            
            # Verify
            verify_query = text("SELECT id FROM plugin WHERE id = :plugin_id AND user_id = :user_id")
            verify_result = await db.execute(verify_query, {'plugin_id': plugin_id, 'user_id': user_id})
            verify_row = verify_result.fetchone()
            
            if verify_row:
                logger.info(f"BrainDriveEvaluator: Created records for {plugin_id}")
            else:
                return {'success': False, 'error': 'Plugin creation verification failed'}
            
            return {'success': True, 'plugin_id': plugin_id, 'modules_created': modules_created}
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error creating database records: {e}")
            await db.rollback()
            return {'success': False, 'error': str(e)}
    
    async def _delete_database_records(self, user_id: str, plugin_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Delete plugin and module records from database"""
        try:
            # Delete modules first
            module_delete_stmt = text("""
            DELETE FROM module 
            WHERE plugin_id = :plugin_id AND user_id = :user_id
            """)
            
            module_result = await db.execute(module_delete_stmt, {
                'plugin_id': plugin_id,
                'user_id': user_id
            })
            
            deleted_modules = module_result.rowcount
            
            # Delete plugin
            plugin_delete_stmt = text("""
            DELETE FROM plugin 
            WHERE id = :plugin_id AND user_id = :user_id
            """)
            
            plugin_result = await db.execute(plugin_delete_stmt, {
                'plugin_id': plugin_id,
                'user_id': user_id
            })
            
            if plugin_result.rowcount == 0:
                await db.rollback()
                return {'success': False, 'error': 'Plugin not found'}
            
            await db.commit()
            
            logger.info(f"BrainDriveEvaluator: Deleted records for {plugin_id}")
            return {'success': True, 'deleted_modules': deleted_modules}
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error deleting records: {e}")
            await db.rollback()
            return {'success': False, 'error': str(e)}
    
    async def _create_plugin_page(self, user_id: str, db: AsyncSession, modules_created: List[str]) -> Dict[str, Any]:
        """Create a page for the BrainDrive Evaluator plugin"""
        try:
            # Check if page already exists
            check_stmt = text("""
                SELECT id FROM pages
                WHERE creator_id = :user_id AND route = :route
            """)
            existing_result = await db.execute(check_stmt, {
                "user_id": user_id,
                "route": "braindrive-evaluator"
            })
            existing = existing_result.fetchone()
            
            if existing:
                existing_page_id = existing.id if hasattr(existing, "id") else existing[0]
                logger.info(f"BrainDriveEvaluator: Page already exists for {user_id}", page_id=existing_page_id)
                return {"success": True, "page_id": existing_page_id, "created": False}
            
            # Find the module ID
            module_id = None
            for mid in modules_created:
                if mid.endswith("_BrainDriveEvaluator"):
                    module_id = mid
                    break
            
            if not module_id:
                # Fallback query
                module_stmt = text("""
                    SELECT id FROM module
                    WHERE user_id = :user_id AND plugin_id = :plugin_id AND name = :name
                """)
                plugin_id = f"{user_id}_{self.plugin_data['plugin_slug']}"
                module_result = await db.execute(module_stmt, {
                    "user_id": user_id,
                    "plugin_id": plugin_id,
                    "name": "BrainDriveEvaluator"
                })
                module_row = module_result.fetchone()
                if module_row:
                    module_id = module_row.id if hasattr(module_row, "id") else module_row[0]
            
            if not module_id:
                logger.error(f"BrainDriveEvaluator: Failed to resolve module ID for {user_id}")
                return {"success": False, "error": "Unable to resolve Evaluator module ID"}
            
            # Create page content with layouts
            timestamp_ms = int(datetime.datetime.utcnow().timestamp() * 1000)
            layout_id = f"Evaluator_{module_id}_{timestamp_ms}"
            
            content = {
                "layouts": {
                    "desktop": [
                        {
                            "i": layout_id,
                            "x": 0,
                            "y": 0,
                            "w": 12,
                            "h": 10,
                            "pluginId": self.plugin_data["plugin_slug"],
                            "args": {
                                "moduleId": module_id,
                                "displayName": "BrainDrive Evaluator"
                            }
                        }
                    ],
                    "tablet": [
                        {
                            "i": layout_id,
                            "x": 0,
                            "y": 0,
                            "w": 4,
                            "h": 6,
                            "pluginId": self.plugin_data["plugin_slug"],
                            "args": {
                                "moduleId": module_id,
                                "displayName": "BrainDrive Evaluator"
                            }
                        }
                    ],
                    "mobile": [
                        {
                            "i": layout_id,
                            "x": 0,
                            "y": 0,
                            "w": 4,
                            "h": 6,
                            "pluginId": self.plugin_data["plugin_slug"],
                            "args": {
                                "moduleId": module_id,
                                "displayName": "BrainDrive Evaluator"
                            }
                        }
                    ]
                },
                "modules": {}
            }
            
            # Insert page
            page_id = uuid.uuid4().hex
            now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            
            insert_stmt = text("""
                INSERT INTO pages (
                    id, name, route, content, creator_id,
                    created_at, updated_at, is_published, publish_date
                ) VALUES (
                    :id, :name, :route, :content, :creator_id,
                    :created_at, :updated_at, :is_published, :publish_date
                )
            """)
            
            await db.execute(insert_stmt, {
                "id": page_id,
                "name": "BrainDrive Evaluator",
                "route": "braindrive-evaluator",
                "content": json.dumps(content),
                "creator_id": user_id,
                "created_at": now,
                "updated_at": now,
                "is_published": 1,
                "publish_date": now
            })
            
            await db.commit()
            logger.info(f"BrainDriveEvaluator: Created page for {user_id}", page_id=page_id)
            return {"success": True, "page_id": page_id, "created": True}
            
        except Exception as e:
            await db.rollback()
            logger.error(f"BrainDriveEvaluator: Failed to create page for {user_id}: {e}")
            return {"success": False, "error": str(e)}
    
    async def _delete_plugin_page(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Delete the BrainDrive Evaluator plugin page"""
        try:
            delete_stmt = text("""
                DELETE FROM pages
                WHERE creator_id = :user_id AND route = :route
            """)
            result = await db.execute(delete_stmt, {
                "user_id": user_id,
                "route": "braindrive-evaluator"
            })
            await db.commit()
            logger.info(f"BrainDriveEvaluator: Deleted page for {user_id}", deleted_rows=result.rowcount)
            return {"success": True, "deleted_rows": result.rowcount}
            
        except Exception as e:
            await db.rollback()
            logger.error(f"BrainDriveEvaluator: Failed to delete page for {user_id}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_plugin_info(self) -> Dict[str, Any]:
        """Get plugin information"""
        return self.plugin_data
    
    @property
    def MODULE_DATA(self):
        """Compatibility property for module data"""
        return self.module_data
    
    # Compatibility methods
    async def install_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Install plugin for user"""
        try:
            logger.info(f"BrainDriveEvaluator: Starting installation for {user_id}")
            
            existing_check = await self._check_existing_plugin(user_id, db)
            if existing_check['exists']:
                logger.warning(f"BrainDriveEvaluator: Already installed for {user_id}")
                return {
                    'success': False,
                    'error': 'Plugin already installed',
                    'plugin_id': existing_check['plugin_id']
                }
            
            shared_path = self.shared_path
            shared_path.mkdir(parents=True, exist_ok=True)

            copy_result = await self._copy_plugin_files_impl(user_id, shared_path)
            if not copy_result['success']:
                return copy_result
            
            result = await self.install_for_user(user_id, db, shared_path)
            
            if result.get('success'):
                verify_check = await self._check_existing_plugin(user_id, db)
                if not verify_check['exists']:
                    return {'success': False, 'error': 'Installation verification failed'}
                
                result.update({
                    'plugin_slug': self.plugin_data['plugin_slug'],
                    'plugin_name': self.plugin_data['name']
                })
            
            return result
                
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Install failed: {e}")
            return {'success': False, 'error': str(e)}
    
    async def delete_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Delete plugin for user"""
        try:
            logger.info(f"BrainDriveEvaluator: Starting deletion for {user_id}")
            # Call _perform_user_uninstallation directly
            result = await self._perform_user_uninstallation(user_id, db)
            return result
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Delete failed: {e}")
            return {'success': False, 'error': str(e)}
    
    async def get_plugin_status(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Get plugin status"""
        try:
            existing_check = await self._check_existing_plugin(user_id, db)
            if not existing_check['exists']:
                return {'exists': False, 'status': 'not_installed'}
            
            plugin_health = await self._get_plugin_health_impl(user_id, self.shared_path)
            
            return {
                'exists': True,
                'status': 'healthy' if plugin_health['healthy'] else 'unhealthy',
                'plugin_id': existing_check['plugin_id'],
                'plugin_info': existing_check['plugin_info'],
                'health_details': plugin_health['details']
            }
            
        except Exception as e:
            logger.error(f"BrainDriveEvaluator: Error checking status: {e}")
            return {'exists': False, 'status': 'error', 'error': str(e)}


# Standalone functions for compatibility with BrainDrive installer
async def install_plugin(user_id: str, db: AsyncSession, plugins_base_dir: str = None) -> Dict[str, Any]:
    manager = BrainDriveEvaluatorLifecycleManager(plugins_base_dir)
    return await manager.install_plugin(user_id, db)

async def delete_plugin(user_id: str, db: AsyncSession, plugins_base_dir: str = None) -> Dict[str, Any]:
    manager = BrainDriveEvaluatorLifecycleManager(plugins_base_dir)
    return await manager.delete_plugin(user_id, db)

async def get_plugin_status(user_id: str, db: AsyncSession, plugins_base_dir: str = None) -> Dict[str, Any]:
    manager = BrainDriveEvaluatorLifecycleManager(plugins_base_dir)
    return await manager.get_plugin_status(user_id, db)


# Test script
if __name__ == "__main__":
    import asyncio
    
    async def main():
        print("BrainDrive Evaluator Plugin Lifecycle Manager - Test Mode")
        print("=" * 60)
        
        manager = BrainDriveEvaluatorLifecycleManager()
        print(f"Plugin: {manager.plugin_data['name']}")
        print(f"Version: {manager.plugin_data['version']}")
        print(f"Slug: {manager.plugin_data['plugin_slug']}")
        print(f"Description: {manager.plugin_data['description']}")
        print(f"Modules: {len(manager.module_data)}")
        
        for module in manager.module_data:
            print(f"  - {module['display_name']} ({module['name']})")
    
    asyncio.run(main())
