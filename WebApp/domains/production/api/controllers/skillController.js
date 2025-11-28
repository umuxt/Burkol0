import * as skillService from '../services/skillService.js';

export const getSkills = async (req, res) => {
  try {
    const skills = await skillService.getAllSkills();
    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
};

export const createSkill = async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Skill name is required' });
  }
  
  try {
    const skill = await skillService.createSkill({ name, description }, req.user);
    res.json(skill);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
};

export const updateSkill = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  try {
    const skill = await skillService.updateSkill(id, { name, description }, req.user);
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(skill);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
};

export const deleteSkill = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await skillService.deleteSkill(id, req.user);
    
    if (!result) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ success: true, id: result.id });
  } catch (error) {
    // Handle usage error specially if it's a known error format
    try {
      const errObj = JSON.parse(error.message);
      if (errObj.message === 'Cannot delete skill in use') {
        return res.status(400).json({ 
          error: errObj.message,
          usage: errObj.usage
        });
      }
    } catch (e) {
      // Not a JSON error, proceed
    }
    
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
};
